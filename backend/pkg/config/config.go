package config

import (
	"os"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	App        AppConfig        `toml:"app"`
	Collector  CollectorConfig  `toml:"collector"`
	API        APIConfig        `toml:"api"`
	Worker     WorkerConfig     `toml:"worker"`
	Redis      RedisConfig      `toml:"redis"`
	ClickHouse ClickHouseConfig `toml:"clickhouse"`
	GeoIP      GeoIPConfig      `toml:"geoip"`
	Postgres   PostgresConfig   `toml:"postgres"`
	Updater    UpdaterConfig    `toml:"updater"`
}

type AppConfig struct {
	Env string `toml:"env"`
}

type SiteConfig struct {
	SiteID string `toml:"site_id"`
	Name   string `toml:"name"`
	JWKS   string `toml:"jwks"`
}

type CollectorConfig struct {
	Addr               string       `toml:"addr"`
	InitAllowedSites   []SiteConfig `toml:"init_allowed_sites"`
	CorsAllowedOrigins []string     `toml:"cors_allowed_origins"`
	TrustedProxies     []string     `toml:"trusted_proxies"`
	ServeSDK           bool         `toml:"serve_sdk"`
}

type WorkerConfig struct {
	HealthAddr string `toml:"health_addr"`
}

type SuperuserConfig struct {
	Username string `toml:"username"`
	Nickname string `toml:"nickname"`
	Email    string `toml:"email"`
	Password string `toml:"password"`
}

type APIConfig struct {
	Addr               string          `toml:"addr"`
	CorsAllowedOrigins []string        `toml:"cors_allowed_origins"`
	TrustedProxies     []string        `toml:"trusted_proxies"`
	JWTSecret          string          `toml:"jwt_secret"`
	AccessTokenExpiry  string          `toml:"access_token_expiry"`
	RefreshTokenExpiry string          `toml:"refresh_token_expiry"`
	Superuser          SuperuserConfig `toml:"superuser"`
}

type RedisConfig struct {
	Addr     string `toml:"addr"`
	Password string `toml:"password"`
	DB       int    `toml:"db"`
	Key      string `toml:"key"`
}

type ClickHouseConfig struct {
	Addr     string `toml:"addr"`
	Database string `toml:"database"`
	Username string `toml:"username"`
	Password string `toml:"password"`
	Table    string `toml:"table"`
}

type GeoIPConfig struct {
	DBIPv4 string `toml:"db_ipv4"`
	DBIPv6 string `toml:"db_ipv6"`
	DBASN  string `toml:"db_asn"`
}

type PostgresConfig struct {
	Addr     string `toml:"addr"`
	Database string `toml:"database"`
	Username string `toml:"username"`
	Password string `toml:"password"`
	SSLMode  string `toml:"sslmode"`
}

type UpdaterConfig struct {
	GeoIP GeoIPUpdaterConfig `toml:"geoip"`
}

type GeoIPUpdaterConfig struct {
	DBIPv4 *GeoIPUpdaterItem `toml:"db_ipv4"`
	DBIPv6 *GeoIPUpdaterItem `toml:"db_ipv6"`
	DBASN  *GeoIPUpdaterItem `toml:"db_asn"`
}

type GeoIPUpdaterItem struct {
	Name string `toml:"name"`
	URL  string `toml:"url"`
	Cron string `toml:"cron"`
}

func LoadConfig(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cfg Config
	decoder := toml.NewDecoder(file)
	if err := decoder.Decode(&cfg); err != nil {
		return nil, err
	}

	// ---------- API Config Default ----------
	if cfg.API.AccessTokenExpiry == "" {
		cfg.API.AccessTokenExpiry = "15m"
	}
	if cfg.API.RefreshTokenExpiry == "" {
		cfg.API.RefreshTokenExpiry = "30d"
	}
	if cfg.API.TrustedProxies == nil {
		cfg.API.TrustedProxies = []string{"127.0.0.1", "::1"}
	}
	if cfg.Collector.TrustedProxies == nil {
		cfg.Collector.TrustedProxies = []string{"127.0.0.1", "::1"}
	}
	if cfg.API.Superuser.Nickname == "" {
		cfg.API.Superuser.Nickname = "Admin"
	}
	if cfg.API.Superuser.Username == "" {
		cfg.API.Superuser.Username = "superuser"
	}
	for _, origin := range cfg.Collector.CorsAllowedOrigins {
		if origin == "*" {
			panic("Wildcard '*' is not allowed in collector.cors_allowed_origins")
		}
	}
	for _, origin := range cfg.API.CorsAllowedOrigins {
		if origin == "*" {
			panic("Wildcard '*' is not allowed in api.cors_allowed_origins")
		}
	}

	// ---------- Worker Config Default ----------
	if cfg.Worker.HealthAddr == "" {
		cfg.Worker.HealthAddr = ":8082"
	}

	// ---------- Updater Config Default ----------
	applyGeoIPUpdaterDefaults(cfg.Updater.GeoIP.DBIPv4, "0 1 2,15 * *")
	applyGeoIPUpdaterDefaults(cfg.Updater.GeoIP.DBIPv6, "0 1 2,15 * *")
	applyGeoIPUpdaterDefaults(cfg.Updater.GeoIP.DBASN, "0 4 * * *")

	return &cfg, nil
}

func applyGeoIPUpdaterDefaults(item *GeoIPUpdaterItem, defaultValue string) {
	if item == nil {
		return
	}
	if item.Cron == "" {
		item.Cron = defaultValue
	}
}
