package parser

import (
	"chiyo_analytics/backend/pkg/config"
	"log/slog"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/mileusna/useragent"
	"github.com/oschwald/maxminddb-golang"
)

type Parser struct {
	mu        sync.RWMutex
	geoDBIPv4 *maxminddb.Reader
	geoDBIPv6 *maxminddb.Reader
	geoDBASN  *maxminddb.Reader

	cfg       config.GeoIPConfig
	modIPv4   time.Time
	modIPv6   time.Time
	modASN    time.Time

	stopChan  chan struct{}
}

type ParsedResult struct {
	Country        string
	CountryCode    string
	Region         string
	City           string
	DeviceType     string
	OSName         string
	OSVersion      string
	BrowserName    string
	BrowserVersion string
	DeviceBrand    string
	DeviceModel    string
	IPASN          *uint32
	IPASNName      *string
}

type CityRecord struct {
	CountryCode string `maxminddb:"country_code"`
	State1      string `maxminddb:"state1"`
	City        string `maxminddb:"city"`
}

type ASNRecord struct {
	AutonomousSystemNumber       uint   `maxminddb:"autonomous_system_number"`
	AutonomousSystemOrganization string `maxminddb:"autonomous_system_organization"`
}

func NewParser(cfg config.GeoIPConfig) *Parser {
	p := &Parser{
		cfg:      cfg,
		stopChan: make(chan struct{}),
	}

	p.checkAndReload()

	if p.geoDBIPv4 == nil && p.geoDBIPv6 == nil {
		slog.Info("No City GeoIP database loaded. Geolocation will fallback to 'Unknown'")
	}
	if p.geoDBASN == nil {
		slog.Info("No ASN GeoIP database loaded. ASN details will fallback to NULL")
	}

	p.startWatcher(5 * time.Minute)

	return p
}

func (p *Parser) reloadFile(path string, readerPtr **maxminddb.Reader, lastMod *time.Time, label string) {
	if path == "" {
		return
	}

	fi, err := os.Stat(path)
	if err != nil {
		if lastMod.IsZero() {
			slog.Warn("Failed to stat GeoIP database on initial load", "label", label, "path", path, "err", err)
		}
		return
	}

	modTime := fi.ModTime()
	if modTime.After(*lastMod) {
		newReader, err := maxminddb.Open(path)
		if err != nil {
			slog.Error("Failed to open updated GeoIP database", "label", label, "path", path, "err", err)
			return
		}

		p.mu.Lock()
		oldReader := *readerPtr
		*readerPtr = newReader
		*lastMod = modTime
		p.mu.Unlock()

		if oldReader != nil {
			oldReader.Close()
		}
		slog.Info("Successfully loaded GeoIP database", "label", label, "path", path, "modTime", modTime)
	}
}

func (p *Parser) checkAndReload() {
	p.reloadFile(p.cfg.DBIPv4, &p.geoDBIPv4, &p.modIPv4, "IPv4")
	p.reloadFile(p.cfg.DBIPv6, &p.geoDBIPv6, &p.modIPv6, "IPv6")
	p.reloadFile(p.cfg.DBASN, &p.geoDBASN, &p.modASN, "ASN")
}

func (p *Parser) startWatcher(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				p.checkAndReload()
			case <-p.stopChan:
				return
			}
		}
	}()
}

func (p *Parser) Close() {
	if p.stopChan != nil {
		close(p.stopChan)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.geoDBIPv4 != nil {
		p.geoDBIPv4.Close()
		p.geoDBIPv4 = nil
	}
	if p.geoDBIPv6 != nil {
		p.geoDBIPv6.Close()
		p.geoDBIPv6 = nil
	}
	if p.geoDBASN != nil {
		p.geoDBASN.Close()
		p.geoDBASN = nil
	}
}

func (p *Parser) Parse(ipStr string, uaStr string) ParsedResult {
	p.mu.RLock()
	defer p.mu.RUnlock()

	res := ParsedResult{
		Country:        "Unknown",
		CountryCode:    "Unknown",
		Region:         "Unknown",
		City:           "Unknown",
		DeviceType:     "Unknown",
		OSName:         "Unknown",
		OSVersion:      "Unknown",
		BrowserName:    "Unknown",
		BrowserVersion: "Unknown",
		DeviceBrand:    "Unknown",
		DeviceModel:    "Unknown",
	}

	// 1. Parse IP Geolocation
	if ipStr != "" {
		ip := net.ParseIP(ipStr)
		if ip != nil {
			if ip.IsLoopback() || ip.IsPrivate() {
				res.Country = "Localhost"
				res.CountryCode = "Local"
				res.Region = "Localhost"
				res.City = "Localhost"
			} else {
				var record CityRecord
				var err error
				var resolved bool

				if ip.To4() != nil && p.geoDBIPv4 != nil {
					err = p.geoDBIPv4.Lookup(ip, &record)
					resolved = true
				} else if ip.To4() == nil && p.geoDBIPv6 != nil {
					err = p.geoDBIPv6.Lookup(ip, &record)
					resolved = true
				}

				if resolved && err == nil {
					if record.CountryCode != "" {
						res.CountryCode = record.CountryCode
						res.Country = record.CountryCode
					}
					if record.State1 != "" {
						res.Region = record.State1
					}
					if record.City != "" {
						res.City = record.City
					}
				}
			}

			// 1.1 Parse ASN Info
			if p.geoDBASN != nil && !ip.IsLoopback() && !ip.IsPrivate() {
				var asnRecord ASNRecord
				err := p.geoDBASN.Lookup(ip, &asnRecord)
				if err == nil && asnRecord.AutonomousSystemNumber != 0 {
					asnVal := uint32(asnRecord.AutonomousSystemNumber)
					res.IPASN = &asnVal
					if asnRecord.AutonomousSystemOrganization != "" {
						orgStr := asnRecord.AutonomousSystemOrganization
						res.IPASNName = &orgStr
					}
				}
			}
		}
	}

	// 2. Parse User-Agent
	if uaStr != "" {
		ua := useragent.Parse(uaStr)

		// Map device types
		if ua.Mobile {
			res.DeviceType = "mobile"
		} else if ua.Tablet {
			res.DeviceType = "tablet"
		} else if ua.Bot {
			res.DeviceType = "bot"
		} else {
			res.DeviceType = "desktop"
		}

		res.OSName = ua.OS
		res.OSVersion = ua.OSVersion
		res.BrowserName = ua.Name
		res.BrowserVersion = ua.Version

		brand, model := extractBrandAndModel(uaStr)
		res.DeviceBrand = brand
		if model != "Unknown" {
			res.DeviceModel = model
		} else if ua.Device != "" {
			res.DeviceModel = ua.Device
		}
	}

	// Clean up empty strings or fallback
	if res.Country == "" {
		res.Country = "Unknown"
	}
	if res.CountryCode == "" {
		res.CountryCode = "Unknown"
	}
	if res.Region == "" {
		res.Region = "Unknown"
	}
	if res.City == "" {
		res.City = "Unknown"
	}
	if res.OSName == "" {
		res.OSName = "Unknown"
	}
	if res.OSVersion == "" {
		res.OSVersion = "Unknown"
	}
	if res.BrowserName == "" {
		res.BrowserName = "Unknown"
	}
	if res.BrowserVersion == "" {
		res.BrowserVersion = "Unknown"
	}
	if res.DeviceBrand == "" {
		res.DeviceBrand = "Unknown"
	}
	if res.DeviceModel == "" {
		res.DeviceModel = "Unknown"
	}

	return res
}

func extractBrandAndModel(uaStr string) (string, string) {
	uaLower := strings.ToLower(uaStr)
	brand := "Unknown"
	model := "Unknown"

	if strings.Contains(uaLower, "oneplus") {
		brand = "OnePlus"
	} else if strings.Contains(uaLower, "huawei") || strings.Contains(uaLower, "honor") {
		brand = "Huawei"
	} else if strings.Contains(uaLower, "xiaomi") || strings.Contains(uaLower, "redmi") || strings.Contains(uaLower, "mi ") {
		brand = "Xiaomi"
	} else if strings.Contains(uaLower, "oppo") {
		brand = "OPPO"
	} else if strings.Contains(uaLower, "vivo") {
		brand = "vivo"
	} else if strings.Contains(uaLower, "samsung") || strings.Contains(uaLower, "galaxy") {
		brand = "Samsung"
	} else if strings.Contains(uaLower, "iphone") {
		brand = "Apple"
		model = "iPhone"
	} else if strings.Contains(uaLower, "ipad") {
		brand = "Apple"
		model = "iPad"
	} else if strings.Contains(uaLower, "macintosh") {
		brand = "Apple"
		model = "Mac"
	} else if strings.Contains(uaLower, "pixel") {
		brand = "Google"
	}

	return brand, model
}
