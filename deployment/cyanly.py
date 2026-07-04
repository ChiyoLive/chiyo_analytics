import sys

from common.i18n import init_lang, t
from rich.console import Console
from single_server_docker.manage import do_restart, do_uninstall, do_up

console = Console()


def main():
    init_lang()

    cmd = None
    skip_next = False
    args = []

    for arg in sys.argv[1:]:
        if skip_next:
            skip_next = False
            continue
        if arg in ("--lang",):
            skip_next = True
            continue
        if not arg.startswith("-") and cmd is None:
            cmd = arg.lower()
        elif cmd is not None:
            args.append(arg)

    if not cmd:
        console.print("[bold]Cyanly Management CLI[/bold]")
        console.print("Usage: python3 cyanly.pyz [command]")
        console.print("Commands: up [service], restart [service], uninstall [--volume]")
        sys.exit(1)

    if cmd == "up":
        service = args[0] if len(args) > 0 else ""
        do_up(service)
    elif cmd == "restart":
        service = args[0] if len(args) > 0 else ""
        do_restart(service)
    elif cmd == "uninstall":
        with_volumes = "--volume" in sys.argv or "-v" in sys.argv
        do_uninstall(with_volumes)
    else:
        console.print(f"[red]{t('err_unknown_command')}: {cmd}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    main()
