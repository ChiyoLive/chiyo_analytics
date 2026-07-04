package models

import "time"

// SDKEvent represents the raw payload sent from the JS SDK
type SDKEvent struct {
	SiteID       string    `json:"site_id"`
	VisitorID    string    `json:"visitor_id"`
	SessionID    string    `json:"session_id"`
	EventName    string    `json:"event_name"`
	Properties   string    `json:"properties"`
	URL          string    `json:"url"`
	Title        string    `json:"title"`
	Referrer     string    `json:"referrer"`
	DurationMs   int32     `json:"duration_ms"`
	ScreenWidth  int32     `json:"screen_width"`
	ScreenHeight int32     `json:"screen_height"`
	Language     string    `json:"language"`
	UTM          UTMParams `json:"utm"`
	Token        string    `json:"token"`
	Consent      *string   `json:"consent"`
	Gpc          bool      `json:"gpc"`
}

// UTMParams represents all UTM and ad click tracking identifiers
type UTMParams struct {
	UTMSource   string `json:"utm_source"`
	UTMMedium   string `json:"utm_medium"`
	UTMCampaign string `json:"utm_campaign"`
	UTMTerm     string `json:"utm_term"`
	UTMContent  string `json:"utm_content"`

	GCLID   string `json:"gclid"`
	FBCLID  string `json:"fbclid"`
	TTCLID  string `json:"ttclid"`
	BLCLID  string `json:"blclid"`
	BDVID   string `json:"bd_vid"`
	GDTVID  string `json:"gdt_vid"`
	MSCLKID string `json:"msclkid"`
	TWCLID  string `json:"twclid"`
	ClickID string `json:"clickid"`
}

// ClickHouseEvent represents the flattened schema written to ClickHouse
type ClickHouseEvent struct {
	SiteID       string    `ch:"site_id"`
	Timestamp    time.Time `ch:"timestamp"`
	VisitorID    string    `ch:"visitor_id"`
	SessionID    string    `ch:"session_id"`
	EventName    string    `ch:"event_name"`
	Properties   string    `ch:"properties"`
	URL          string    `ch:"url"`
	Title        string    `ch:"title"`
	Referrer     string    `ch:"referrer"`
	DurationMs   int32     `ch:"duration_ms"`
	ScreenWidth  int32     `ch:"screen_width"`
	ScreenHeight int32     `ch:"screen_height"`

	// UTM
	UTMSource   string `ch:"utm_source"`
	UTMMedium   string `ch:"utm_medium"`
	UTMCampaign string `ch:"utm_campaign"`
	UTMTerm     string `ch:"utm_term"`
	UTMContent  string `ch:"utm_content"`

	// Ad Clicks
	GCLID   string `ch:"gclid"`
	FBCLID  string `ch:"fbclid"`
	TTCLID  string `ch:"ttclid"`
	BLCLID  string `ch:"blclid"`
	BDVID   string `ch:"bd_vid"`
	GDTVID  string `ch:"gdt_vid"`
	MSCLKID string `ch:"msclkid"`
	TWCLID  string `ch:"twclid"`
	ClickID string `ch:"clickid"`

	// Parsed Geolocation
	IP      string `ch:"ip"`
	Country string `ch:"country"`
	Region  string `ch:"region"`
	City    string `ch:"city"`

	// Parsed Device / OS / Browser
	UserAgent      string `ch:"user_agent"`
	DeviceType     string `ch:"device_type"`
	OSName         string `ch:"os_name"`
	OSVersion      string `ch:"os_version"`
	BrowserName    string `ch:"browser_name"`
	BrowserVersion string `ch:"browser_version"`

	// Additional Fields
	Language    string  `ch:"language"`
	CountryCode string  `ch:"country_code"`
	DeviceBrand string  `ch:"device_brand"`
	DeviceModel string  `ch:"device_model"`
	IPASN       *uint32 `ch:"ip_asn"`
	IPASNName   *string `ch:"ip_asn_name"`
}
