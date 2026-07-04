import shlex
import subprocess
import time
import tomllib
from pathlib import Path

from rich.console import Console
from rich.live import Live

from mng_scripts.service_manager import ServiceManager
from mng_scripts.tui import (
    TerminalCbreakContext,
    check_key,
    create_layout,
    update_layout,
)


def dev(config: str = "", dashboard_cmd: str = "pnpm dev"):
    """
    Start collector, worker, api, and dashboard simultaneously in a single terminal.
    Renders a 2x2 grid layout displaying logs for each service, with support for
    zooming in/out on specific services, and saves raw logs to the logs/ directory.
    """
    console = Console()
    root_dir = Path(__file__).resolve().parent.parent
    backend_dir = root_dir / "backend"
    dashboard_dir = root_dir / "dashboard"
    log_dir = root_dir / "logs"

    # Resolve config path to absolute, so Go binaries can find it
    if config:
        config_abs = Path(config).resolve()
    else:
        config_abs = root_dir / "chiyo_analytics.toml"

    # Ensure Git pre-push hook is installed automatically
    if (root_dir / ".git").exists():
        try:
            subprocess.run(
                ["uv", "run", "pre-commit", "install", "--hook-type", "pre-push"],
                cwd=str(root_dir),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass

    from mng_scripts.geoip_mng import check_and_prepare_geoip_files
    check_and_prepare_geoip_files(str(config_abs))

    config_args = ["-config", str(config_abs)]

    # Load config to extract ClickHouse connection details
    try:
        with open(config_abs, "rb") as f:
            cfg = tomllib.load(f)
    except Exception as e:
        console.print(
            f"[bold red]Failed to load config file {config_abs}: {e}[/bold red]"
        )
        return

    # Extract dashboard config and generate .env.local
    dashboard_cfg = cfg.get("dashboard", {})
    analytics_api_url = dashboard_cfg.get("analytics_api_url", "http://localhost:8081")
    env_local_path = dashboard_dir / ".env.local"
    try:
        with open(env_local_path, "w", encoding="utf-8") as f:
            f.write(f"ANALYTICS_API_URL={analytics_api_url}\n")
        console.print(f"[bold green]Generated {env_local_path.relative_to(root_dir)} with ANALYTICS_API_URL={analytics_api_url}[/bold green]")
    except Exception as e:
        console.print(f"[bold yellow]Warning: Failed to write {env_local_path}: {e}[/bold yellow]")

    ch_cfg = cfg.get("clickhouse", {})
    addr = ch_cfg.get("addr", "localhost:9000")
    user = ch_cfg.get("username", "default")
    password = ch_cfg.get("password", "")
    database = ch_cfg.get("database", "cyanly")
    table = ch_cfg.get("table", "cyanly.events")

    # Construct ClickHouse DSN
    auth = ""
    if user:
        auth = user
        if password:
            auth += f":{password}"
        auth += "@"
    dsn = f"clickhouse://{auth}{addr}/{database}"

    # Parse PostgreSQL config
    pg_cfg = cfg.get("postgres", {})
    pg_addr = pg_cfg.get("addr", "localhost:5432")
    pg_user = pg_cfg.get("username", "cyanly")
    pg_password = pg_cfg.get("password", "cyanly-password")
    pg_database = pg_cfg.get("database", "cyanly")
    pg_sslmode = pg_cfg.get("sslmode", "disable")

    # Construct Postgres DSN
    pg_auth = ""
    if pg_user:
        pg_auth = pg_user
        if pg_password:
            pg_auth += f":{pg_password}"
        pg_auth += "@"
    pg_dsn = f"postgres://{pg_auth}{pg_addr}/{pg_database}?sslmode={pg_sslmode}"

    # 1. Run PostgreSQL Migrations
    console.print("[bold blue]Running PostgreSQL migrations...[/bold blue]")
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
        res = subprocess.run(
            pg_migration_cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            check=True,
        )
        if res.stdout:
            for line in res.stdout.splitlines():
                console.print(f"[dim blue][Postgres Migration] {line}[/dim blue]")
        console.print(
            "[bold green]PostgreSQL migrations applied successfully.[/bold green]"
        )
    except subprocess.CalledProcessError as e:
        console.print("[bold red]PostgreSQL migrations failed![/bold red]")
        console.print(f"[red]{e.stderr or e.stdout}[/red]")
        return

    # 2. Run ClickHouse Migrations
    console.print("[bold blue]Running ClickHouse migrations...[/bold blue]")
    ch_migrations_dir = backend_dir / "migrations" / "ch_analytics"
    ch_migration_cmd = [
        "go",
        "run",
        "./cmd/cy_migrate/main.go",
        "--driver",
        "clickhouse",
        "--dsn",
        dsn,
        "--migrations",
        str(ch_migrations_dir),
        "--var",
        f"table={table}",
        "apply",
    ]

    try:
        res = subprocess.run(
            ch_migration_cmd,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            check=True,
        )
        if res.stdout:
            for line in res.stdout.splitlines():
                console.print(f"[dim blue][ClickHouse Migration] {line}[/dim blue]")
        console.print(
            "[bold green]ClickHouse migrations applied successfully.[/bold green]"
        )
    except subprocess.CalledProcessError as e:
        console.print("[bold red]ClickHouse migrations failed![/bold red]")
        console.print(f"[red]{e.stderr or e.stdout}[/red]")
        return

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
            "cmd": shlex.split(dashboard_cmd),
            "cwd": dashboard_dir,
            "color": "magenta",
        },
        "updater": {
            "cmd": ["go", "run", "./cmd/updater"] + config_args,
            "cwd": backend_dir,
            "color": "blue",
        },
    }

    manager = ServiceManager(services_config, log_dir)

    try:
        log_dir_display = log_dir.relative_to(root_dir)
    except ValueError:
        log_dir_display = log_dir

    console.print("[bold blue]Starting development services...[/bold blue]")
    console.print(
        f"[bold dim blue]Logging raw output to: {log_dir_display}/[/bold dim blue]"
    )

    manager.start_all()

    exited_name = None
    exited_code = None
    focused = None
    start_time = time.time()
    layout = create_layout(focused)

    try:
        with (
            Live(layout, screen=True, refresh_per_second=10) as live,
            TerminalCbreakContext(),
        ):
            while True:
                # Check for keyboard input (1, 2, 3, 4, ESC)
                key = check_key()
                if key:
                    new_focus = focused
                    if key == "1":
                        new_focus = "collector"
                    elif key == "2":
                        new_focus = "worker"
                    elif key == "3":
                        new_focus = "api"
                    elif key == "4":
                        new_focus = "dashboard"
                    elif key == "escape":
                        new_focus = None

                    if new_focus != focused:
                        focused = new_focus
                        layout = create_layout(focused)
                        live.update(layout)

                # Check if any process has exited unexpectedly
                exited = manager.poll_any()
                if exited:
                    exited_name, exited_code = exited
                    break

                # Update the active panel layouts
                update_layout(layout, manager.services, focused, start_time)
                time.sleep(0.05)

    except KeyboardInterrupt:
        console.print(
            "\n[bold yellow]Ctrl+C received. Shutting down all services...[/bold yellow]"
        )
    except Exception as e:
        console.print(f"\n[bold red]Error occurred: {e}[/bold red]")
    finally:
        console.print("[bold blue]Stopping all services...[/bold blue]")
        manager.shutdown()
        console.print("[bold green]All services stopped.[/bold green]")
        if exited_name is not None:
            console.print(
                f"\n[bold red]Process '{exited_name}' exited unexpectedly with code {exited_code}.[/bold red]"
            )
