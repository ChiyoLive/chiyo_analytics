import socket
import subprocess
import sys
import time
import tomllib
import urllib.request
from pathlib import Path

from rich.console import Console

from mng_scripts.cleaner import clean_ports
from mng_scripts.service_manager import ServiceManager


def wait_for_tcp(port: int, host: str = "localhost", timeout: float = 30.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1.0):
                return True
        except (socket.timeout, ConnectionRefusedError):
            time.sleep(0.5)
    raise TimeoutError(f"Timed out waiting for port {port} on {host} to be ready")


def wait_for_clickhouse(timeout: float = 30.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(
                "http://localhost:8123/ping", timeout=1.0
            ) as response:
                if response.read().decode("utf-8").strip() == "Ok.":
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    raise TimeoutError(
        "Timed out waiting for ClickHouse HTTP ping endpoint to respond 'Ok.'"
    )


def e2e(config: str = "", test_file: str = ""):
    """
    Automated E2E test runner.
    1. Tear down existing dev containers and volumes.
    2. Start fresh dev containers.
    3. Wait for databases to be ready.
    4. Run schema migrations.
    5. Clean up target service ports.
    6. Build and launch all services and examples.
    7. Wait for services to be ready.
    8. Execute Playwright tests.
    9. Stop all services and return Playwright's exit code.
    """
    console = Console()

    root_dir = Path(__file__).resolve().parent.parent
    backend_dir = root_dir / "backend"
    dashboard_dir = root_dir / "dashboard"
    log_dir = root_dir / "logs" / "e2e"
    tests_dir = root_dir / "tests"

    # Resolve config path
    if config:
        config_abs = Path(config).resolve()
    else:
        config_abs = root_dir / "tests" / "e2e" / "chiyo_analytics.e2e.toml"

    from mng_scripts.geoip_mng import check_and_prepare_geoip_files
    check_and_prepare_geoip_files(str(config_abs))

    config_args = ["-config", str(config_abs)]

    # Load configuration
    try:
        with open(config_abs, "rb") as f:
            cfg = tomllib.load(f)
    except Exception as e:
        console.print(
            f"[bold red]Failed to load E2E config file {config_abs}: {e}[/bold red]"
        )
        sys.exit(1)

    # Extract dashboard config and generate .env.local
    dashboard_cfg = cfg.get("dashboard", {})
    analytics_api_url = dashboard_cfg.get("analytics_api_url", "http://localhost:8081")
    env_local_path = dashboard_dir / ".env.local"
    try:
        with open(env_local_path, "w", encoding="utf-8") as f:
            f.write(f"ANALYTICS_API_URL={analytics_api_url}\n")
        console.print(
            f"[bold green]Generated {env_local_path.relative_to(root_dir)} with ANALYTICS_API_URL={analytics_api_url}[/bold green]"
        )
    except Exception as e:
        console.print(
            f"[bold yellow]Warning: Failed to write {env_local_path}: {e}[/bold yellow]"
        )

    # ClickHouse config
    ch_cfg = cfg.get("clickhouse", {})
    ch_addr = ch_cfg.get("addr", "localhost:9000")
    ch_user = ch_cfg.get("username", "default")
    ch_password = ch_cfg.get("password", "")
    ch_database = ch_cfg.get("database", "cyanly")
    ch_table = ch_cfg.get("table", "cyanly.events")

    ch_auth = f"{ch_user}:{ch_password}@" if ch_password else f"{ch_user}@"
    ch_dsn = f"clickhouse://{ch_auth}{ch_addr}/{ch_database}"

    # Postgres config
    pg_cfg = cfg.get("postgres", {})
    pg_addr = pg_cfg.get("addr", "localhost:5432")
    pg_host, pg_port_str = pg_addr.split(":")
    pg_port = int(pg_port_str)
    pg_user = pg_cfg.get("username", "cyanly")
    pg_password = pg_cfg.get("password", "cyanly-password")
    pg_database = pg_cfg.get("database", "cyanly")
    pg_sslmode = pg_cfg.get("sslmode", "disable")

    pg_auth = f"{pg_user}:{pg_password}@" if pg_password else f"{pg_user}@"
    pg_dsn = f"postgres://{pg_auth}{pg_addr}/{pg_database}?sslmode={pg_sslmode}"

    # Redis config
    redis_cfg = cfg.get("redis", {})
    redis_addr = redis_cfg.get("addr", "localhost:6379")
    redis_host, redis_port_str = redis_addr.split(":")
    redis_port = int(redis_port_str)

    # Target service ports
    ports_to_clean = [8079, 8080, 8081, 8082, 13001, 13002, 13003, 23002]

    # --- Step 1: docker-compose down -v ---
    console.print(
        "[bold blue]1. Tearing down dev containers and volumes...[/bold blue]"
    )
    try:
        subprocess.run(
            ["docker", "compose", "down", "-v"],
            cwd=str(root_dir),
            check=True,
        )
    except subprocess.CalledProcessError as e:
        console.print(f"[bold red]Failed to tear down containers: {e}[/bold red]")
        sys.exit(1)

    # --- Step 2: docker-compose up -d ---
    console.print("[bold blue]2. Starting fresh dev containers...[/bold blue]")
    try:
        subprocess.run(
            ["docker", "compose", "up", "-d"],
            cwd=str(root_dir),
            check=True,
        )
    except subprocess.CalledProcessError as e:
        console.print(f"[bold red]Failed to start containers: {e}[/bold red]")
        sys.exit(1)

    # --- Step 3: Wait for databases ---
    console.print(
        "[bold blue]3. Waiting for database readiness (Postgres, Redis, ClickHouse)...[/bold blue]"
    )
    try:
        wait_for_tcp(pg_port, pg_host, timeout=30.0)
        wait_for_tcp(redis_port, redis_host, timeout=30.0)
        wait_for_clickhouse(timeout=30.0)
        console.print("[bold green]Databases are ready.[/bold green]")
    except TimeoutError as e:
        console.print(f"[bold red]{e}[/bold red]")
        sys.exit(1)

    # Give database engines a small moment to fully initialize internal engines
    time.sleep(2.0)

    # --- Step 4: Run Migrations ---
    console.print("[bold blue]4. Running database schema migrations...[/bold blue]")

    # Postgres
    pg_migrations_dir = backend_dir / "migrations" / "pg_metadata"
    pg_migration_cmd = [
        "go",
        "run",
        "./cmd/cy_migrate/main.go",
        "--driver",
        "postgres",
        "--dsn",
        pg_dsn,
        "--migrations",
        str(pg_migrations_dir),
        "apply",
    ]
    try:
        subprocess.run(
            pg_migration_cmd, cwd=str(backend_dir), check=True, capture_output=True
        )
        console.print(
            "[bold green]PostgreSQL migrations applied successfully.[/bold green]"
        )
    except subprocess.CalledProcessError as e:
        console.print("[bold red]PostgreSQL migrations failed![/bold red]")
        console.print(f"[red]{e.stderr or e.stdout}[/red]")
        sys.exit(1)

    # ClickHouse
    ch_migrations_dir = backend_dir / "migrations" / "ch_analytics"
    ch_migration_cmd = [
        "go",
        "run",
        "./cmd/cy_migrate/main.go",
        "--driver",
        "clickhouse",
        "--dsn",
        ch_dsn,
        "--migrations",
        str(ch_migrations_dir),
        "--var",
        f"table={ch_table}",
        "apply",
    ]
    try:
        subprocess.run(
            ch_migration_cmd, cwd=str(backend_dir), check=True, capture_output=True
        )
        console.print(
            "[bold green]ClickHouse migrations applied successfully.[/bold green]"
        )
    except subprocess.CalledProcessError as e:
        console.print("[bold red]ClickHouse migrations failed![/bold red]")
        console.print(f"[red]{e.stderr or e.stdout}[/red]")
        sys.exit(1)

    # --- Step 5: Clean service ports ---
    console.print("[bold blue]5. Checking and cleaning service ports...[/bold blue]")
    try:
        clean_ports(ports_to_clean, yes=True)
    except Exception as e:
        console.print(
            f"[dim yellow]Port cleaning encountered warnings: {e}[/dim yellow]"
        )

    # --- Step 6: Build examples & prepare dependencies ---
    console.print(
        "[bold blue]6. Preparing dependencies and building examples...[/bold blue]"
    )

    # Run pnpm install in tests folder if node_modules doesn't exist
    if not (tests_dir / "node_modules").exists():
        console.print("[blue]Installing tests dependencies...[/blue]")
        subprocess.run(["pnpm", "install"], cwd=str(tests_dir), check=True)

    # Make sure Playwright browsers are installed
    console.print("[blue]Installing Playwright browsers...[/blue]")
    subprocess.run(
        ["pnpm", "exec", "playwright", "install"], cwd=str(tests_dir), check=True
    )

    # Build web example
    console.print("[blue]Building web example...[/blue]")
    web_example_dir = root_dir / "examples" / "web"
    if not (web_example_dir / "node_modules").exists():
        subprocess.run(["pnpm", "install"], cwd=str(web_example_dir), check=True)
    subprocess.run(["pnpm", "run", "build"], cwd=str(web_example_dir), check=True)

    # --- Step 7: Launch all services ---
    console.print(
        "[bold blue]7. Starting cyanly services and examples concurrently...[/bold blue]"
    )
    console.print(
        f"[bold dim blue]Writing logs to: {log_dir.relative_to(root_dir)}/[/bold dim blue]"
    )

    services_config = {
        "collector": {
            "cmd": ["go", "run", "./cmd/collector"] + config_args,
            "cwd": backend_dir,
            "color": "green",
        },
        "worker": {
            "cmd": ["go", "run", "./cmd/worker"] + config_args,
            "cwd": backend_dir,
            "color": "yellow",
        },
        "api": {
            "cmd": ["go", "run", "./cmd/api"] + config_args,
            "cwd": backend_dir,
            "color": "cyan",
        },
        "dashboard": {
            "cmd": ["pnpm", "run", "dev"],
            "cwd": dashboard_dir,
            "color": "magenta",
        },
        "updater": {
            "cmd": ["go", "run", "./cmd/updater"] + config_args,
            "cwd": backend_dir,
            "color": "blue",
        },
        "example_nextjs": {
            "cmd": ["pnpm", "run", "dev"],
            "cwd": root_dir / "examples" / "nextjs",
            "color": "blue",
        },
        "example_vite": {
            "cmd": ["pnpm", "run", "dev"],
            "cwd": root_dir / "examples" / "vite_react_router",
            "color": "white",
        },
        "example_web": {
            "cmd": ["pnpm", "run", "start"],
            "cwd": web_example_dir,
            "color": "green",
        },
    }

    manager = ServiceManager(services_config, log_dir)
    manager.start_all()

    playwright_exit_code = 1

    try:
        # --- Step 8: Wait for services ---
        console.print(
            "[bold blue]8. Waiting for all services to accept connections...[/bold blue]"
        )
        # Wait for all active ports to be reachable
        for port in ports_to_clean:
            wait_for_tcp(port, "localhost", timeout=45.0)

        # Give them an extra 2 seconds to make sure React dev servers are fully initialised
        time.sleep(2.0)
        console.print("[bold green]All services are up and running.[/bold green]")

        # --- Step 9: Run Playwright tests ---
        console.print("[bold blue]9. Running Playwright E2E tests...[/bold blue]")

        # Run test script
        cmd = ["pnpm", "exec", "playwright", "test"]
        if test_file:
            cmd.append(test_file)
        res = subprocess.run(
            cmd,
            cwd=str(tests_dir),
        )
        playwright_exit_code = res.returncode
        if playwright_exit_code == 0:
            console.print(
                "[bold green]E2E Playwright tests passed successfully![/bold green]"
            )
        else:
            console.print(
                f"[bold red]E2E Playwright tests failed with exit code {playwright_exit_code}[/bold red]"
            )

    except Exception as e:
        console.print(f"[bold red]Error during E2E test execution: {e}[/bold red]")
        playwright_exit_code = 1
    finally:
        # --- Step 10: Graceful Shutdown ---
        console.print("[bold blue]10. Stopping all services...[/bold blue]")
        manager.shutdown()
        console.print("[bold green]All services stopped.[/bold green]")

        # Propagate the exit code
        sys.exit(playwright_exit_code)
