package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "chiyo_analytics.toml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}
	return path
}

func TestLoadConfigAppliesUpdaterCronDefaults(t *testing.T) {
	path := writeTempConfig(t, `
[updater.geoip.db_ipv4]
url = "https://example.test/dbip-city-ipv4.mmdb"

[updater.geoip.db_ipv6]
url = "https://example.test/dbip-city-ipv6.mmdb"

[updater.geoip.db_asn]
url = "https://example.test/origin-asn.mmdb"
`)

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	const wantCron = "0 1 2,15 * *"
	const wantASNCron = "0 4 * * *"
	if cfg.Updater.GeoIP.DBIPv4.Cron != wantCron {
		t.Fatalf("DBIPv4 cron = %q, want %q", cfg.Updater.GeoIP.DBIPv4.Cron, wantCron)
	}
	if cfg.Updater.GeoIP.DBIPv6.Cron != wantCron {
		t.Fatalf("DBIPv6 cron = %q, want %q", cfg.Updater.GeoIP.DBIPv6.Cron, wantCron)
	}
	if cfg.Updater.GeoIP.DBASN.Cron != wantASNCron {
		t.Fatalf("DBASN cron = %q, want %q", cfg.Updater.GeoIP.DBASN.Cron, wantASNCron)
	}
}

func TestLoadConfigAllowsMissingUpdaterItems(t *testing.T) {
	path := writeTempConfig(t, `
[updater.geoip.db_ipv4]
url = "https://example.test/dbip-city-ipv4.mmdb"
`)

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Updater.GeoIP.DBIPv4 == nil {
		t.Fatal("expected DBIPv4 updater item to be present")
	}
	if cfg.Updater.GeoIP.DBIPv6 != nil {
		t.Fatalf("expected DBIPv6 updater item to be nil, got %+v", cfg.Updater.GeoIP.DBIPv6)
	}
	if cfg.Updater.GeoIP.DBASN != nil {
		t.Fatalf("expected DBASN updater item to be nil, got %+v", cfg.Updater.GeoIP.DBASN)
	}
}

func TestLoadConfigAppliesWorkerHealthAddrDefault(t *testing.T) {
	path := writeTempConfig(t, ``)

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Worker.HealthAddr != ":8082" {
		t.Fatalf("Worker.HealthAddr = %q, want %q", cfg.Worker.HealthAddr, ":8082")
	}
}

func TestLoadConfigAllowsWorkerHealthAddrOverride(t *testing.T) {
	path := writeTempConfig(t, `
[worker]
health_addr = "127.0.0.1:18082"
`)

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Worker.HealthAddr != "127.0.0.1:18082" {
		t.Fatalf("Worker.HealthAddr = %q, want %q", cfg.Worker.HealthAddr, "127.0.0.1:18082")
	}
}
