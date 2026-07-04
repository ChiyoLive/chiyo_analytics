package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/oschwald/maxminddb-golang"
	"github.com/robfig/cron/v3"
)

func readTestMMDB(t *testing.T) []byte {
	t.Helper()

	dbPath := "../../../dbip-city-ipv4.mmdb"
	data, err := os.ReadFile(dbPath)
	if err != nil {
		t.Skipf("Skipping test because source MMDB was not found at %s: %v", dbPath, err)
	}
	return data
}

func TestDownloadAndReplace(t *testing.T) {
	data := readTestMMDB(t)

	// 1. Mock an HTTP Server that serves the real database from the repository root (relative path)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		w.Write(data)
	}))
	defer ts.Close()

	// 2. Set temporary target output path
	targetPath := filepath.Join(t.TempDir(), "temp_downloaded_dbip.mmdb")

	// 3. Trigger downloadAndReplace
	err := downloadAndReplace(targetPath, ts.URL, "test_geoip_job")
	if err != nil {
		t.Fatalf("downloadAndReplace failed: %v", err)
	}

	// 4. Validate output file
	db, err := maxminddb.Open(targetPath)
	if err != nil {
		t.Fatalf("Failed to open downloaded file as MaxMind DB: %v", err)
	}
	db.Close()
}

func TestDownloadAndReplaceRejectsInvalidDatabase(t *testing.T) {
	originalData := readTestMMDB(t)
	targetPath := filepath.Join(t.TempDir(), "dbip-city-ipv4.mmdb")
	if err := os.WriteFile(targetPath, originalData, 0644); err != nil {
		t.Fatalf("failed to write original database: %v", err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not a maxmind database"))
	}))
	defer ts.Close()

	err := downloadAndReplace(targetPath, ts.URL, "test_geoip_job")
	if err == nil {
		t.Fatal("expected invalid database error, got nil")
	}

	got, readErr := os.ReadFile(targetPath)
	if readErr != nil {
		t.Fatalf("failed to read target database after failed update: %v", readErr)
	}
	if string(got) != string(originalData) {
		t.Fatal("target database was replaced after invalid download")
	}

	if _, statErr := os.Stat(targetPath + ".tmp"); !os.IsNotExist(statErr) {
		t.Fatalf("expected temporary file to be removed, stat err = %v", statErr)
	}
}

func TestDownloadAndReplaceRejectsHTTPError(t *testing.T) {
	originalData := readTestMMDB(t)
	targetPath := filepath.Join(t.TempDir(), "dbip-city-ipv4.mmdb")
	if err := os.WriteFile(targetPath, originalData, 0644); err != nil {
		t.Fatalf("failed to write original database: %v", err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer ts.Close()

	err := downloadAndReplace(targetPath, ts.URL, "test_geoip_job")
	if err == nil {
		t.Fatal("expected HTTP status error, got nil")
	}

	got, readErr := os.ReadFile(targetPath)
	if readErr != nil {
		t.Fatalf("failed to read target database after failed update: %v", readErr)
	}
	if string(got) != string(originalData) {
		t.Fatal("target database was replaced after HTTP failure")
	}

	if _, statErr := os.Stat(targetPath + ".tmp"); !os.IsNotExist(statErr) {
		t.Fatalf("expected temporary file not to exist, stat err = %v", statErr)
	}
}

func TestCronExpressionsValidation(t *testing.T) {
	// robfig/cron/v3 uses standard parser by default when cron.New() is called without custom parsers,
	// but standard parser parses 5 fields (minute hour day-of-month month day-of-week).
	// Let's verify that the cron expressions used in the config are valid standard cron expressions.
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)

	testExpressions := []string{
		"0 4 * * *",    // from chiyo_analytics.toml config
		"0 1 2,15 * *", // default cron expression from config.go
	}

	for _, expr := range testExpressions {
		_, err := parser.Parse(expr)
		if err != nil {
			t.Errorf("Cron expression %q is invalid: %v", expr, err)
		}
	}
}
