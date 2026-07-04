import os
import pkgutil
import re
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from common.i18n import t
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
    config = {}
    current_section = None
    section_pat = re.compile(r"^\[([^\]]+)\]")
    key_val_pat = re.compile(r"^([a-zA-Z0-9_\-\.]+)\s*=\s*(.*)$")

    for line in content_str.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m_sec = section_pat.match(line)
        if m_sec:
            current_section = m_sec.group(1).strip()
            config[current_section] = {}
        else:
            m_kv = key_val_pat.match(line)
            if m_kv:
                key = m_kv.group(1).strip()
                val = m_kv.group(2).strip()
                if (val.startswith('"') and val.endswith('"')) or (
                    val.startswith("'") and val.endswith("'")
                ):
                    val = val[1:-1]
                if current_section:
                    config[current_section][key] = val
                else:
                    config[key] = val
    return config


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
    ch_password = config.get("clickhouse", {}).get(
        "password", "cyanly-password-change-me"
    )
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

    rendered = rendered.replace(
        "${DB_PASSWORD:-cyanly-password-change-me}", pg_password
    )
    rendered = rendered.replace(
        "${CH_PASSWORD:-cyanly-password-change-me}", ch_password
    )
    rendered = rendered.replace("${COLLECTOR_PORT:-8080}", str(collector_port))
    rendered = rendered.replace("${API_PORT:-8081}", str(api_port))
    rendered = rendered.replace("${WORKER_PORT:-8082}", str(worker_port))
    rendered = rendered.replace("${DASHBOARD_PORT:-8079}", str(dashboard_port))
    rendered = rendered.replace(
        "${ANALYTICS_API_URL:-http://localhost:8081}", analytics_api_url
    )

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
