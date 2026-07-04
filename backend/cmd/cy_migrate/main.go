package main

import (
	"bytes"
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	_ "github.com/lib/pq"
)

type varFlags map[string]interface{}

func (v *varFlags) String() string {
	return ""
}

func (v *varFlags) Set(value string) error {
	parts := strings.SplitN(value, "=", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid var format, must be key=value: %s", value)
	}
	(*v)[parts[0]] = parts[1]
	return nil
}

type migrationFile struct {
	version uint32
	name    string
	path    string
}

func main() {
	driverFlag := flag.String("driver", "", "Database driver: 'clickhouse' or 'postgres' (falls back to auto-detection from DSN scheme)")
	dsnFlag := flag.String("dsn", "", "Database connection DSN (falls back to CLICKHOUSE_DSN or POSTGRES_DSN env var)")
	migrationsFlag := flag.String("migrations", "./migrations", "Directory containing migration SQL files")

	vars := make(varFlags)
	flag.Var(&vars, "var", "Variables for template replacement (key=value)")

	flag.Parse()

	// 1. Determine Driver & Resolve DSN
	dsn := *dsnFlag
	driver := strings.ToLower(*driverFlag)

	if dsn == "" {
		if driver == "postgres" {
			dsn = os.Getenv("POSTGRES_DSN")
		} else if driver == "clickhouse" {
			dsn = os.Getenv("CLICKHOUSE_DSN")
		} else {
			// Try both
			if dsn = os.Getenv("CLICKHOUSE_DSN"); dsn == "" {
				dsn = os.Getenv("POSTGRES_DSN")
			}
		}
	}

	if dsn == "" {
		slog.Error("Missing connection DSN. Pass via --dsn flag or set CLICKHOUSE_DSN / POSTGRES_DSN environment variables.")
		panic("Missing connection DSN. Pass via --dsn flag or set CLICKHOUSE_DSN / POSTGRES_DSN environment variables.")
	}

	// Scheme-based auto-detection if driver is not explicitly set
	if driver == "" {
		if strings.HasPrefix(dsn, "clickhouse://") {
			driver = "clickhouse"
		} else if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
			driver = "postgres"
		} else {
			// Fallback default
			driver = "clickhouse"
		}
	}

	args := flag.Args()
	cmd := "apply"
	if len(args) > 0 {
		cmd = args[0]
	}

	migrationsDir := *migrationsFlag
	if cmd == "new" {
		if err := os.MkdirAll(migrationsDir, 0755); err != nil {
			slog.Error("Failed to create migrations directory", "err", err)
			panic(err)
		}
	} else {
		if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
			slog.Error("Migrations directory does not exist", "path", migrationsDir)
			panic("Migrations directory does not exist: " + migrationsDir)
		}
	}

	// 2. Read and parse migration files from directory
	migrationFiles, err := loadMigrationFiles(migrationsDir)
	if err != nil {
		slog.Error("Failed to load migration files", "err", err)
		panic(err)
	}

	ctx := context.Background()

	// 3. Handle commands
	switch cmd {
	case "new":
		if len(args) < 2 {
			slog.Error("Missing migration name. Usage: cy_migrate new <name>")
			panic("Missing migration name. Usage: cy_migrate new <name>")
		}
		nameArg := args[1]
		if err := runNew(migrationsDir, migrationFiles, nameArg); err != nil {
			slog.Error("Failed to create migration", "err", err)
			panic(err)
		}

	case "status":
		applied, err := getAppliedMigrations(ctx, driver, dsn)
		if err != nil {
			slog.Error("Failed to get applied migrations", "err", err)
			panic(err)
		}
		runStatus(migrationFiles, applied)

	case "apply":
		applied, err := getAppliedMigrations(ctx, driver, dsn)
		if err != nil {
			slog.Error("Failed to get applied migrations", "err", err)
			panic(err)
		}
		if err := runApply(ctx, driver, dsn, migrationFiles, applied, vars); err != nil {
			slog.Error("Migration failed", "err", err)
			panic(err)
		}

	default:
		slog.Error("Unknown command", "command", cmd)
		panic("Unknown command: " + cmd)
	}
}

func loadMigrationFiles(dir string) ([]migrationFile, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var files []migrationFile
	versionMap := make(map[uint32]string)

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		name := entry.Name()
		parts := strings.SplitN(name, "_", 2)
		if len(parts) < 2 {
			continue // ignore files without prefix separator
		}

		version, err := strconv.ParseUint(parts[0], 10, 32)
		if err != nil {
			continue // ignore files that do not start with a valid integer
		}

		v := uint32(version)
		if existing, found := versionMap[v]; found {
			return nil, fmt.Errorf("duplicate migration version %d: %s and %s", v, existing, name)
		}
		versionMap[v] = name

		files = append(files, migrationFile{
			version: v,
			name:    name,
			path:    filepath.Join(dir, name),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].version < files[j].version
	})

	return files, nil
}

func runStatus(files []migrationFile, applied map[uint32]bool) {
	fmt.Println("Version | Migration File                 | Status")
	fmt.Println("--------|--------------------------------|---------")
	for _, f := range files {
		status := "pending"
		if applied[f.version] {
			status = "applied"
		}
		fmt.Printf("%04d    | %-30s | %s\n", f.version, f.name, status)
	}
}

func getAppliedMigrations(ctx context.Context, driver, dsn string) (map[uint32]bool, error) {
	applied := make(map[uint32]bool)

	if driver == "clickhouse" {
		opts, err := clickhouse.ParseDSN(dsn)
		if err != nil {
			return nil, fmt.Errorf("failed to parse ClickHouse DSN: %w", err)
		}

		targetDB := opts.Auth.Database
		if targetDB == "" {
			targetDB = "default"
			opts.Auth.Database = targetDB
		}
		clickHouseMigrationTable := fmt.Sprintf("`%s`.`schema_migrations`", targetDB)
		if targetDB != "" && targetDB != "default" {
			defaultOpts := *opts
			defaultOpts.Auth.Database = "default"

			defaultConn, err := clickhouse.Open(&defaultOpts)
			if err != nil {
				return nil, fmt.Errorf("failed to connect to default DB: %w", err)
			}
			if err := defaultConn.Ping(ctx); err != nil {
				defaultConn.Close()
				return nil, fmt.Errorf("failed to ping default DB: %w", err)
			}
			if err := defaultConn.Exec(ctx, fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`", targetDB)); err != nil {
				defaultConn.Close()
				return nil, fmt.Errorf("failed to create ClickHouse database: %w", err)
			}
			defaultConn.Close()
		}

		conn, err := clickhouse.Open(opts)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to ClickHouse database '%s': %w", targetDB, err)
		}
		defer conn.Close()

		if err := conn.Ping(ctx); err != nil {
			return nil, fmt.Errorf("failed to ping ClickHouse target: %w", err)
		}

		err = conn.Exec(ctx, fmt.Sprintf(`
			CREATE TABLE IF NOT EXISTS %s (
				version UInt32,
				applied_at DateTime DEFAULT now()
			) ENGINE = MergeTree()
			ORDER BY version;
		`, clickHouseMigrationTable))
		if err != nil {
			return nil, fmt.Errorf("failed to create schema_migrations table: %w", err)
		}

		rows, err := conn.Query(ctx, fmt.Sprintf("SELECT version FROM %s", clickHouseMigrationTable))
		if err != nil {
			return nil, fmt.Errorf("failed to query schema_migrations: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var v uint32
			if err := rows.Scan(&v); err != nil {
				return nil, err
			}
			applied[v] = true
		}

	} else if driver == "postgres" {
		if err := ensureDatabaseExistsPostgres(dsn); err != nil {
			return nil, fmt.Errorf("failed to ensure Postgres database exists: %w", err)
		}

		db, err := sql.Open("postgres", dsn)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to Postgres: %w", err)
		}
		defer db.Close()

		if err := db.PingContext(ctx); err != nil {
			return nil, fmt.Errorf("failed to ping Postgres: %w", err)
		}

		_, err = db.ExecContext(ctx, `
			CREATE TABLE IF NOT EXISTS public.schema_migrations (
				version INT PRIMARY KEY,
				applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			);
		`)
		if err != nil {
			return nil, fmt.Errorf("failed to create schema_migrations table: %w", err)
		}

		rows, err := db.QueryContext(ctx, "SELECT version FROM public.schema_migrations")
		if err != nil {
			return nil, fmt.Errorf("failed to query schema_migrations: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var v uint32
			if err := rows.Scan(&v); err != nil {
				return nil, err
			}
			applied[v] = true
		}
	}

	return applied, nil
}

func ensureDatabaseExistsPostgres(dsn string) error {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return err
		}
		targetDB := strings.TrimPrefix(u.Path, "/")
		if targetDB == "" || targetDB == "postgres" {
			return nil
		}

		// Connect to default "postgres" db to check/create the target database
		u.Path = "/postgres"
		tempDsn := u.String()

		db, err := sql.Open("postgres", tempDsn)
		if err != nil {
			return err
		}
		defer db.Close()

		var exists bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", targetDB).Scan(&exists)
		if err != nil {
			return err
		}

		if !exists {
			slog.Info("PostgreSQL database does not exist. Creating it", "database", targetDB)
			// CREATE DATABASE cannot run inside a transaction/prepared statement
			_, err = db.Exec(fmt.Sprintf("CREATE DATABASE %s", targetDB))
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func runApply(ctx context.Context, driver, dsn string, files []migrationFile, applied map[uint32]bool, vars map[string]interface{}) error {
	pendingCount := 0
	for _, f := range files {
		if !applied[f.version] {
			pendingCount++
		}
	}

	if pendingCount == 0 {
		slog.Info("Database schema is up to date. No new migrations to apply")
		return nil
	}

	slog.Info("Found pending migrations to apply", "driver", driver, "count", pendingCount)

	if driver == "clickhouse" {
		opts, err := clickhouse.ParseDSN(dsn)
		if err != nil {
			return err
		}
		targetDB := opts.Auth.Database
		if targetDB == "" {
			targetDB = "default"
			opts.Auth.Database = targetDB
		}
		clickHouseMigrationTable := fmt.Sprintf("`%s`.`schema_migrations`", targetDB)
		conn, err := clickhouse.Open(opts)
		if err != nil {
			return err
		}
		defer conn.Close()

		for _, f := range files {
			if applied[f.version] {
				continue
			}

			sqlQuery, err := renderTemplate(f.path, f.name, vars)
			if err != nil {
				return err
			}

			if sqlQuery != "" {
				slog.Info("Applying ClickHouse migration", "name", f.name)
				if err := conn.Exec(ctx, sqlQuery); err != nil {
					return fmt.Errorf("failed to execute ClickHouse migration %s: %w", f.name, err)
				}
			}

			err = conn.Exec(ctx, fmt.Sprintf("INSERT INTO %s (version) VALUES (?)", clickHouseMigrationTable), f.version)
			if err != nil {
				return fmt.Errorf("failed to record version %d in schema_migrations: %w", f.version, err)
			}
			slog.Info("Successfully applied ClickHouse migration", "name", f.name)
		}

	} else if driver == "postgres" {
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			return err
		}
		defer db.Close()

		for _, f := range files {
			if applied[f.version] {
				continue
			}

			sqlQuery, err := renderTemplate(f.path, f.name, vars)
			if err != nil {
				return err
			}

			if sqlQuery != "" {
				slog.Info("Applying PostgreSQL migration", "name", f.name)

				tx, err := db.BeginTx(ctx, nil)
				if err != nil {
					return err
				}

				if _, err := tx.ExecContext(ctx, sqlQuery); err != nil {
					tx.Rollback()
					return fmt.Errorf("failed to execute Postgres migration %s: %w", f.name, err)
				}

				if _, err := tx.ExecContext(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", f.version); err != nil {
					tx.Rollback()
					return fmt.Errorf("failed to record version %d in schema_migrations: %w", f.version, err)
				}

				if err := tx.Commit(); err != nil {
					return fmt.Errorf("failed to commit transaction for migration %s: %w", f.name, err)
				}
			} else {
				// Empty migration file
				if _, err := db.ExecContext(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", f.version); err != nil {
					return fmt.Errorf("failed to record version %d in schema_migrations: %w", f.version, err)
				}
			}
			slog.Info("Successfully applied PostgreSQL migration", "name", f.name)
		}
	}

	slog.Info("All migrations applied successfully")
	return nil
}

func renderTemplate(path, name string, vars map[string]interface{}) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to read file %s: %w", name, err)
	}

	tmpl, err := template.New(name).Option("missingkey=error").Parse(string(content))
	if err != nil {
		return "", fmt.Errorf("failed to parse template for %s: %w", name, err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, vars); err != nil {
		return "", fmt.Errorf("failed to execute template for %s: %w", name, err)
	}

	return strings.TrimSpace(buf.String()), nil
}

func runNew(dir string, files []migrationFile, name string) error {
	var maxVersion uint32 = 0
	for _, f := range files {
		if f.version > maxVersion {
			maxVersion = f.version
		}
	}

	nextVersion := maxVersion + 1
	safeName := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			return r
		}
		return '_'
	}, name)

	newFileName := fmt.Sprintf("%04d_%s.sql", nextVersion, safeName)
	newFilePath := filepath.Join(dir, newFileName)

	content := fmt.Sprintf("-- Migration: %s\n-- Created at: %s\n\n", name, time.Now().Format(time.RFC3339))
	if err := os.WriteFile(newFilePath, []byte(content), 0644); err != nil {
		return err
	}

	fmt.Printf("Created migration file: %s\n", newFilePath)
	return nil
}
