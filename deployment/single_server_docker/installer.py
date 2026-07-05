import os
import pkgutil
import shutil
import subprocess
import sys
import tomllib
import urllib.request
from dataclasses import dataclass
from io import StringIO
from pathlib import Path

from common.i18n import t
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TransferSpeedColumn,
)
from rich.prompt import Confirm

console = Console()


@dataclass
class GeoipURL:
    name: str
    url: str


@dataclass
class GeoipURLs:
    db_ipv4: GeoipURL
    db_ipv6: GeoipURL
    db_asn: GeoipURL


DEFAULT_GEOIP_URLS = GeoipURLs(
    db_ipv4=GeoipURL(
        name="dbip-city-ipv4.mmdb",
        url="https://github.com/sapics/ip-location-db/releases/download/latest/dbip-city-ipv4.mmdb",
    ),
    db_ipv6=GeoipURL(
        name="dbip-city-ipv6.mmdb",
        url="https://github.com/sapics/ip-location-db/releases/download/latest/dbip-city-ipv6.mmdb",
    ),
    db_asn=GeoipURL(
        name="origin-asn.mmdb",
        url="https://github.com/sapics/ip-location-db/releases/download/latest/origin-asn.mmdb",
    ),
)

INSTALL_POINTER_PATH = Path.home() / ".cyanly_installed"
DEFAULT_INSTALL_DIR = Path.home() / ".cyanly"


def do_config():
    target_dir = Path("./cyanly-preinstall")
    console.print(f"[cyan]{t('msg_init_config_dir')} {target_dir} ...[/cyan]")
    target_dir.mkdir(exist_ok=True)

    try:
        toml_content = pkgutil.get_data("single_server_docker", "chiyo_analytics.toml")
        if toml_content is None:
            raise Exception("config template is none")
        toml_content = toml_content.decode("utf-8")
    except Exception as e:
        console.print(f"[bold red]{t('err_read_toml_template')}: {e}[/bold red]")
        sys.exit(1)

    toml_path = target_dir / "chiyo_analytics.toml"
    if not confirm_overwrite([toml_path]):
        console.print(f"[yellow]{t('msg_aborted')}[/yellow]")
        sys.exit(1)
    toml_path.write_text(toml_content, encoding="utf-8")
    console.print(f"[green]{t('msg_generated')}: {toml_path}[/green]")
    console.print(f"\n[bold]{t('msg_config_next_steps')}[/bold]")


def parse_toml(content_str):
    return tomllib.loads(content_str)


def extract_port(addr_str, default_port):
    if not addr_str:
        return default_port
    parts = addr_str.split(":")
    if len(parts) >= 2:
        port_part = parts[-1]
        port_part = "".join(filter(str.isdigit, port_part))
        if port_part.isdigit():
            return int(port_part)
    return default_port


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False
    raise ValueError(f"expected boolean value, got {value!r}")


def parse_host_port(value, default_port=0):
    if value is None:
        return default_port
    if isinstance(value, int):
        port = value
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default_port
        if not stripped.isdigit():
            raise ValueError(f"expected numeric host port, got {value!r}")
        port = int(stripped)
    else:
        raise ValueError(f"expected numeric host port, got {value!r}")
    if port < 0 or port > 65535:
        raise ValueError(f"host port out of range: {port}")
    return port


def build_port_bindings(bindings):
    return [
        f"{host_port}:{container_port}"
        for host_port, container_port in bindings
        if host_port > 0
    ]


def is_bind_volume(source: str) -> bool:
    return source.startswith(("/", "./", "../", "~"))


def set_command_arg(service, flag: str, value: str):
    command = service.get("command")
    if not isinstance(command, list):
        raise ValueError(f"service command must be a list for {flag}")
    try:
        idx = command.index(flag)
    except ValueError as exc:
        raise ValueError(f"missing command flag {flag}") from exc
    if idx + 1 >= len(command):
        raise ValueError(f"missing value for command flag {flag}")
    command[idx + 1] = value


def set_mapping_dependency(service, dependency: str, condition: str):
    depends_on = service.setdefault("depends_on", CommentedMap())
    if not isinstance(depends_on, dict):
        depends_on = CommentedMap()
        service["depends_on"] = depends_on
    depends_on[dependency] = CommentedMap({"condition": condition})


def remove_mapping_dependency(service, dependency: str):
    depends_on = service.get("depends_on")
    if isinstance(depends_on, dict):
        depends_on.pop(dependency, None)
        if not depends_on:
            service.pop("depends_on", None)


def set_ports(service, ports):
    if ports:
        service["ports"] = CommentedSeq(ports)
    else:
        service.pop("ports", None)


def set_single_volume(service, source: str, target: str):
    service["volumes"] = CommentedSeq([f"{source}:{target}"])


def set_named_volume(volumes, default_name: str, source: str, external: bool):
    volumes.pop(default_name, None)
    if not external and not is_bind_volume(source):
        volumes[source] = CommentedMap()


def replace_env_value(environment, key: str, value):
    if isinstance(environment, dict):
        environment[key] = value
        return
    if isinstance(environment, list):
        prefix = f"{key}="
        for idx, item in enumerate(environment):
            if isinstance(item, str) and item.startswith(prefix):
                environment[idx] = f"{prefix}{value}"
                return
        environment.append(f"{prefix}{value}")
        return
    raise ValueError(f"unsupported environment format for {key}")


def download_file_with_progress(url: str, dest_path: str):
    console.print(
        f"[cyan]{t('msg_downloading')} {os.path.basename(dest_path)}...[/cyan]"
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
    )
    try:
        with urllib.request.urlopen(req) as response:
            total_size = int(response.info().get("Content-Length", 0))

            with Progress(
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                DownloadColumn(),
                TransferSpeedColumn(),
                console=console,
            ) as progress:
                task = progress.add_task(os.path.basename(dest_path), total=total_size)
                with open(dest_path, "wb") as f:
                    chunk_size = 1024 * 1024
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        progress.update(task, advance=len(chunk))

    except Exception as e:
        console.print(f"\n[bold red]{t('err_download_failed')} {url}: {e}[/bold red]")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise e


def get_dest_arg() -> Path | None:
    if "--dest" not in sys.argv:
        return None
    idx = sys.argv.index("--dest")
    if idx + 1 >= len(sys.argv):
        console.print("[bold red]--dest requires a path[/bold red]")
        sys.exit(1)
    return Path(sys.argv[idx + 1]).expanduser()


def resolve_install_dir() -> Path:
    dest_arg = get_dest_arg()
    if dest_arg is not None:
        return dest_arg

    if INSTALL_POINTER_PATH.exists():
        try:
            recorded_text = INSTALL_POINTER_PATH.read_text(encoding="utf-8").strip()
            if recorded_text:
                recorded = Path(recorded_text).expanduser()
                if recorded.exists():
                    return recorded
                console.print(
                    f"[yellow]{t('warn_install_pointer_invalid')}: {recorded}[/yellow]"
                )
        except Exception as e:
            console.print(f"[yellow]{t('warn_install_pointer_invalid')}: {e}[/yellow]")

    return DEFAULT_INSTALL_DIR


def record_install_dir(install_dir: Path):
    try:
        INSTALL_POINTER_PATH.write_text(
            str(install_dir.resolve()) + "\n", encoding="utf-8"
        )
        console.print(
            f"[green]{t('msg_recorded_install_dir')}: {INSTALL_POINTER_PATH}[/green]"
        )
    except Exception as e:
        console.print(f"[yellow]{t('warn_record_install_dir_failed')}: {e}[/yellow]")


def confirm_overwrite(paths: list[Path]) -> bool:
    existing_paths = [path for path in paths if path.exists()]
    if not existing_paths:
        return True
    if "-y" in sys.argv or "--yes" in sys.argv:
        return True

    console.print(f"[yellow]{t('warn_existing_files')}[/yellow]")
    for path in existing_paths:
        console.print(f"  {path}")
    return Confirm.ask(t("prompt_overwrite_existing_files"), default=False)


def load_install_config():
    preinstall_dir = Path("./cyanly-preinstall")
    toml_path = preinstall_dir / "chiyo_analytics.toml"

    if not toml_path.exists():
        console.print(f"[bold red]{t('err_no_config')} {toml_path}[/bold red]")
        sys.exit(1)

    console.print(f"[cyan]{t('msg_reading_config')}: {toml_path} ...[/cyan]")
    toml_content = toml_path.read_text(encoding="utf-8")
    config = parse_toml(toml_content)
    return toml_path, config


def render_compose(config):

    pg_password = config.get("postgres", {}).get(
        "password", "cyanly-password-change-me"
    )
    pg_user = config.get("postgres", {}).get("username", "cyanly")
    pg_db = config.get("postgres", {}).get("database", "cyanly")
    pg_sslmode = config.get("postgres", {}).get("sslmode", "disable")
    pg_addr = config.get("postgres", {}).get("addr", "cyanly-postgres:5432")

    ch_password = config.get("clickhouse", {}).get(
        "password", "cyanly-password-change-me"
    )
    ch_user = config.get("clickhouse", {}).get("username", "default")
    ch_db = config.get("clickhouse", {}).get("database", "cyanly")
    ch_table = config.get("clickhouse", {}).get("table", "cyanly.events")
    ch_addr = config.get("clickhouse", {}).get("addr", "cyanly-clickhouse:9000")

    def get_deploy_cfg(svc_name):
        return config.get(svc_name, {}).get("deploy", {}).get("single_server_docker", {})

    pg_deploy = get_deploy_cfg("postgres")
    pg_external = parse_bool(pg_deploy.get("external"), False)
    pg_host_port = parse_host_port(pg_deploy.get("host_port"), 0)
    pg_volume = pg_deploy.get("volume", "pg-data")

    ch_deploy = get_deploy_cfg("clickhouse")
    ch_external = parse_bool(ch_deploy.get("external"), False)
    ch_native_host_port = parse_host_port(ch_deploy.get("native_host_port"), 0)
    ch_http_host_port = parse_host_port(ch_deploy.get("http_host_port"), 0)
    ch_volume = ch_deploy.get("volume", "clickhouse-data")

    redis_deploy = get_deploy_cfg("redis")
    redis_external = parse_bool(redis_deploy.get("external"), False)
    redis_host_port = parse_host_port(redis_deploy.get("host_port"), 0)
    redis_volume = redis_deploy.get("volume", "redis-data")


    collector_port = extract_port(config.get("collector", {}).get("addr"), 8080)
    api_port = extract_port(config.get("api", {}).get("addr"), 8081)
    worker_port = extract_port(config.get("worker", {}).get("health_addr"), 8082)
    dashboard_port = 8079

    analytics_api_url = config.get("dashboard", {}).get(
        "analytics_api_url", f"http://localhost:{api_port}"
    )

    try:
        compose_template = pkgutil.get_data(
            "single_server_docker", "docker-compose.yaml"
        )
        if compose_template is None:
            raise Exception("compose template is None")
        rendered = compose_template.decode("utf-8")
    except Exception as e:
        console.print(f"[bold red]{t('err_read_compose_template')}: {e}[/bold red]")
        sys.exit(1)

    yaml = YAML()
    yaml.preserve_quotes = True
    compose = yaml.load(rendered)
    services = compose["services"]
    volumes = compose.setdefault("volumes", CommentedMap())

    pg_dsn = (
        f"postgres://{pg_user}:{pg_password}@{pg_addr}/{pg_db}"
        f"?sslmode={pg_sslmode}"
    )
    ch_dsn = f"clickhouse://{ch_user}:{ch_password}@{ch_addr}/{ch_db}"

    set_command_arg(services["cyanly-migrate-pg"], "--dsn", pg_dsn)
    set_command_arg(services["cyanly-migrate-ch"], "--dsn", ch_dsn)
    set_command_arg(services["cyanly-migrate-ch"], "--var", f"table={ch_table}")
    replace_env_value(services["cyanly-postgres"]["environment"], "POSTGRES_DB", pg_db)
    replace_env_value(
        services["cyanly-postgres"]["environment"], "POSTGRES_USER", pg_user
    )
    replace_env_value(
        services["cyanly-clickhouse"]["environment"], "CLICKHOUSE_DB", ch_db
    )
    replace_env_value(
        services["cyanly-clickhouse"]["environment"], "CLICKHOUSE_USER", ch_user
    )

    set_ports(services["cyanly-collector"], [f"{collector_port}:{collector_port}"])
    set_ports(services["cyanly-api"], [f"{api_port}:{api_port}"])
    set_ports(services["cyanly-worker"], [f"{worker_port}:{worker_port}"])
    set_ports(services["cyanly-dashboard"], [f"{dashboard_port}:{dashboard_port}"])

    if pg_external:
        services.pop("cyanly-postgres", None)
        services["cyanly-migrate-pg"].pop("depends_on", None)
    else:
        set_ports(
            services["cyanly-postgres"],
            [f"{pg_host_port}:5432"] if pg_host_port > 0 else [],
        )
        set_single_volume(services["cyanly-postgres"], pg_volume, "/var/lib/postgresql")
        set_mapping_dependency(
            services["cyanly-migrate-pg"], "cyanly-postgres", "service_healthy"
        )
    set_named_volume(volumes, "pg-data", pg_volume, pg_external)

    if ch_external:
        services.pop("cyanly-clickhouse", None)
        services["cyanly-migrate-ch"].pop("depends_on", None)
    else:
        set_ports(
            services["cyanly-clickhouse"],
            build_port_bindings(
                [(ch_native_host_port, 9000), (ch_http_host_port, 8123)]
            ),
        )
        set_single_volume(
            services["cyanly-clickhouse"], ch_volume, "/var/lib/clickhouse"
        )
        set_mapping_dependency(
            services["cyanly-migrate-ch"], "cyanly-clickhouse", "service_healthy"
        )
    set_named_volume(volumes, "clickhouse-data", ch_volume, ch_external)

    if redis_external:
        services.pop("cyanly-redis", None)
        remove_mapping_dependency(services["cyanly-collector"], "cyanly-redis")
        remove_mapping_dependency(services["cyanly-worker"], "cyanly-redis")
    else:
        set_ports(
            services["cyanly-redis"],
            [f"{redis_host_port}:6379"] if redis_host_port > 0 else [],
        )
        set_single_volume(services["cyanly-redis"], redis_volume, "/data")
        set_mapping_dependency(
            services["cyanly-collector"], "cyanly-redis", "service_healthy"
        )
        set_mapping_dependency(
            services["cyanly-worker"], "cyanly-redis", "service_healthy"
        )
    set_named_volume(volumes, "redis-data", redis_volume, redis_external)

    if not volumes:
        compose.pop("volumes", None)

    output = StringIO()
    yaml.dump(compose, output)
    rendered = output.getvalue()

    env_content = f"DB_PASSWORD={pg_password}\nCH_PASSWORD={ch_password}\nANALYTICS_API_URL={analytics_api_url}\n"
    return rendered, env_content


def do_gen():
    toml_path, config = load_install_config()
    rendered, env_content = render_compose(config)
    install_dir = resolve_install_dir()
    console.print(f"[cyan]{t('msg_creating_install_dir')}: {install_dir} ...[/cyan]")
    install_dir.mkdir(parents=True, exist_ok=True)

    generated_paths = [
        install_dir / "docker-compose.yaml",
        install_dir / "chiyo_analytics.toml",
        install_dir / ".env",
        install_dir / "cyanly.pyz",
    ]
    if not confirm_overwrite(generated_paths):
        console.print(f"[yellow]{t('msg_aborted')}[/yellow]")
        sys.exit(1)

    (install_dir / "docker-compose.yaml").write_text(rendered, encoding="utf-8")
    shutil.copy(toml_path, install_dir / "chiyo_analytics.toml")

    (install_dir / ".env").write_text(env_content, encoding="utf-8")

    try:
        cyanly_pyz_data = pkgutil.get_data("single_server_docker", "cyanly.pyz")
        if cyanly_pyz_data:
            (install_dir / "cyanly.pyz").write_bytes(cyanly_pyz_data)
            console.print(f"[green]{t('msg_extracted_cyanly_pyz')}[/green]")
    except Exception as e:
        console.print(f"[yellow]{t('warn_extract_cyanly_pyz_failed')}: {e}[/yellow]")

    console.print(f"[green]{t('msg_config_copied')}[/green]")

    # Download GeoIP
    geoip_dir = install_dir / "geoip"
    geoip_dir.mkdir(exist_ok=True)

    console.print(f"[cyan]{t('msg_syncing_geoip')}[/cyan]")
    geoip_urls = {
        DEFAULT_GEOIP_URLS.db_ipv4.name: DEFAULT_GEOIP_URLS.db_ipv4.url,
        DEFAULT_GEOIP_URLS.db_ipv6.name: DEFAULT_GEOIP_URLS.db_ipv6.url,
        DEFAULT_GEOIP_URLS.db_asn.name: DEFAULT_GEOIP_URLS.db_asn.url,
    }

    for filename, url in geoip_urls.items():
        dest_path = geoip_dir / filename
        if dest_path.exists() and dest_path.stat().st_size > 1024 * 1024:
            console.print(f"[cyan]{t('msg_geoip_exists_skipping')}: {filename}[/cyan]")
        else:
            if dest_path.exists() and not confirm_overwrite([dest_path]):
                console.print(f"[yellow]{t('msg_aborted')}[/yellow]")
                sys.exit(1)
            try:
                download_file_with_progress(url, str(dest_path))
            except Exception:
                console.print(f"[yellow]{t('warn_geoip_download_failed')}[/yellow]")

    record_install_dir(install_dir)
    console.print(f"[green]{t('msg_gen_success')}[/green]")


def find_compose_command() -> list[str]:
    cmd = ["docker", "compose"]
    try:
        subprocess.run(
            cmd + ["version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return cmd
    except Exception:
        cmd = ["docker-compose"]
        try:
            subprocess.run(
                cmd + ["--version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return cmd
        except Exception:
            console.print(f"[bold red]{t('err_docker_compose_missing')}[/bold red]")
            sys.exit(1)


def do_up():
    install_dir = resolve_install_dir()
    compose_path = install_dir / "docker-compose.yaml"
    if not compose_path.exists():
        console.print(f"[bold red]{t('err_compose_not_found')}: {compose_path}[/bold red]")
        sys.exit(1)

    console.print(f"\n[cyan]{t('msg_starting_docker')}[/cyan]")
    cmd = find_compose_command()
    try:
        subprocess.run(cmd + ["up", "-d"], cwd=str(install_dir), check=True)
    except subprocess.CalledProcessError as e:
        console.print(f"\n[bold red]{t('err_cmd_failed')} {e.returncode}[/bold red]")
        sys.exit(1)

    record_install_dir(install_dir)
    console.print(f"[green]{t('msg_up_success')}[/green]")


def do_install():
    do_gen()
    do_up()
    console.print(f"\n[bold green]{t('msg_install_success')}[/bold green]")
