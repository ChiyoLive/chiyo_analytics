package parser

import (
	"chiyo_analytics/backend/pkg/config"
	"io"
	"os"
	"testing"
	"time"
)

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func TestParserHotReload(t *testing.T) {
	// Use the real MMDB files in the repository root for testing (relative path from backend/pkg/parser)
	srcPath := "../../../dbip-city-ipv4.mmdb"
	tmpPath := "./temp_test_dbip.mmdb"

	// Copy the file
	err := copyFile(srcPath, tmpPath)
	if err != nil {
		t.Skipf("Skipping test because source MMDB was not found at %s: %v", srcPath, err)
		return
	}
	defer os.Remove(tmpPath)

	// Set file modification time to the past (e.g. 5 seconds ago)
	pastTime := time.Now().Add(-5 * time.Second)
	err = os.Chtimes(tmpPath, pastTime, pastTime)
	if err != nil {
		t.Fatalf("Failed to set initial file time: %v", err)
	}

	cfg := config.GeoIPConfig{
		DBIPv4: tmpPath,
	}

	// Note: NewParser will start a background watcher.
	p := NewParser(cfg)
	defer p.Close()

	if p.geoDBIPv4 == nil {
		t.Fatalf("Expected geoDBIPv4 to be loaded, got nil")
	}

	// Record initial mod time and reader instance
	initialMod := p.modIPv4
	initialReader := p.geoDBIPv4

	// Verify lookups work initially
	resInitial := p.Parse("8.8.8.8", "Mozilla/5.0")
	if resInitial.CountryCode == "Unknown" {
		// Note: The mock/real DB might return Unknown depending on the IP, but we check it doesn't crash
		t.Logf("Initial parse result: %+v", resInitial)
	}

	// Touch the temp file to update its modification time to the current time (which is newer than pastTime)
	now := time.Now()
	err = os.Chtimes(tmpPath, now, now)
	if err != nil {
		t.Fatalf("Failed to touch file: %v", err)
	}

	// Trigger manual check and reload to test the reload mechanism directly
	p.checkAndReload()

	if p.modIPv4.Equal(initialMod) {
		t.Errorf("Expected mod time to change, but it remained %v", initialMod)
	}

	if p.geoDBIPv4 == initialReader {
		t.Errorf("Expected geoDBIPv4 reader to be replaced with a new instance, but it remained the same")
	}

	// Verify lookups still work after reload
	resPost := p.Parse("8.8.8.8", "Mozilla/5.0")
	t.Logf("Post-reload parse result: %+v", resPost)
}

func TestParserHotReloadKeepsExistingReaderWhenUpdatedFileIsInvalid(t *testing.T) {
	srcPath := "../../../dbip-city-ipv4.mmdb"
	tmpPath := "./temp_invalid_reload_dbip.mmdb"

	err := copyFile(srcPath, tmpPath)
	if err != nil {
		t.Skipf("Skipping test because source MMDB was not found at %s: %v", srcPath, err)
		return
	}
	defer os.Remove(tmpPath)

	pastTime := time.Now().Add(-5 * time.Second)
	err = os.Chtimes(tmpPath, pastTime, pastTime)
	if err != nil {
		t.Fatalf("Failed to set initial file time: %v", err)
	}

	p := NewParser(config.GeoIPConfig{DBIPv4: tmpPath})
	defer p.Close()

	if p.geoDBIPv4 == nil {
		t.Fatalf("Expected geoDBIPv4 to be loaded, got nil")
	}

	initialMod := p.modIPv4
	initialReader := p.geoDBIPv4

	err = os.WriteFile(tmpPath, []byte("not a maxmind database"), 0644)
	if err != nil {
		t.Fatalf("Failed to replace temp database with invalid contents: %v", err)
	}

	now := time.Now()
	err = os.Chtimes(tmpPath, now, now)
	if err != nil {
		t.Fatalf("Failed to touch invalid database file: %v", err)
	}

	p.checkAndReload()

	if !p.modIPv4.Equal(initialMod) {
		t.Errorf("Expected mod time to remain %v after invalid reload, got %v", initialMod, p.modIPv4)
	}

	if p.geoDBIPv4 != initialReader {
		t.Error("Expected geoDBIPv4 reader to remain unchanged after invalid reload")
	}
}
