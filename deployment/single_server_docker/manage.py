import subprocess
import sys
from pathlib import Path

from common.i18n import t
from rich.console import Console
from rich.prompt import Confirm

console = Console()

INSTALL_POINTER_PATH = Path.home() / ".cyanly_installed"
DEFAULT_INSTALL_DIR = Path.home() / ".cyanly"


def get_install_dir() -> Path:
    if INSTALL_POINTER_PATH.exists():
        try:
            recorded_text = INSTALL_POINTER_PATH.read_text(encoding="utf-8").strip()
            if not recorded_text:
                raise ValueError("empty install pointer")
            recorded = Path(recorded_text).expanduser()
            if (recorded / "docker-compose.yaml").exists():
                return recorded
            console.print(
                f"[yellow]{t('warn_install_pointer_invalid')}: {recorded}[/yellow]"
            )
        except Exception as e:
            console.print(
                f"[yellow]{t('warn_install_pointer_invalid')}: {e}[/yellow]"
            )

    if (DEFAULT_INSTALL_DIR / "docker-compose.yaml").exists():
        return DEFAULT_INSTALL_DIR

    console.print(
        f"[bold red]{t('err_install_dir_not_found')}: {INSTALL_POINTER_PATH}, {DEFAULT_INSTALL_DIR}[/bold red]"
    )
    sys.exit(1)


def clear_install_pointer(install_dir: Path):
    if not INSTALL_POINTER_PATH.exists():
        return

    try:
        recorded = Path(INSTALL_POINTER_PATH.read_text(encoding="utf-8").strip())
        if recorded.expanduser().resolve() == install_dir.resolve():
            INSTALL_POINTER_PATH.unlink()
            console.print(f"[green]{t('msg_removed_install_pointer')}[/green]")
    except Exception:
        return


def run_compose(args: list[str], cwd: Path):
    cmd = ["docker", "compose"]
    try:
        subprocess.run(
            cmd + ["version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        cmd = ["docker-compose"]
        try:
            subprocess.run(
                cmd + ["--version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            console.print(f"[bold red]{t('err_docker_compose_missing')}[/bold red]")
            sys.exit(1)

    try:
        subprocess.run(cmd + args, cwd=str(cwd), check=True)
    except subprocess.CalledProcessError as e:
        console.print(f"[bold red]{t('err_cmd_failed')}[/bold red] {e.returncode}")
        sys.exit(1)


def do_up(service: str = ""):
    install_dir = get_install_dir()
    args = ["up", "-d"]
    if service:
        args.append(service)
    console.print(f"[cyan]{t('msg_starting_service')}[/cyan]")
    run_compose(args, install_dir)
    console.print(f"[green]{t('msg_done')}[/green]")


def do_restart(service: str = ""):
    install_dir = get_install_dir()
    args = ["restart"]
    if service:
        args.append(service)
    console.print(f"[cyan]{t('msg_restarting_service')}[/cyan]")
    run_compose(args, install_dir)
    console.print(f"[green]{t('msg_done')}[/green]")


def do_uninstall(with_volumes: bool = False):
    install_dir = get_install_dir()

    if with_volumes:
        console.print(f"\n[bold red]{t('warn_uninstall_volumes')}[/bold red]")
        if "-y" not in sys.argv and "--yes" not in sys.argv:
            if not Confirm.ask(t("prompt_confirm_destructive")):
                console.print(f"[yellow]{t('msg_aborted')}[/yellow]")
                return

    console.print(f"[cyan]{t('msg_stopping_containers')}[/cyan]")
    args = ["down"]
    if with_volumes:
        args.append("-v")

    if (install_dir / "docker-compose.yaml").exists():
        run_compose(args, install_dir)

    console.print(f"[cyan]{t('msg_removing_files')}[/cyan]")
    import shutil

    try:
        if install_dir.exists():
            shutil.rmtree(install_dir)
            clear_install_pointer(install_dir)
            console.print(f"[green]{t('msg_uninstall_success')}[/green]")
    except Exception as e:
        console.print(f"[red]{t('err_remove_failed')} {install_dir}: {e}[/red]")
        sys.exit(1)
