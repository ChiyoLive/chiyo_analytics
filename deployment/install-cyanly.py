import sys

from common.i18n import init_lang, t
from rich.console import Console
from single_server_docker.installer import do_config, do_gen, do_install, do_up

console = Console()


def print_help():
    console.print(f"\n[bold cyan]Cyanly (Chiyo Analytics) {t('cli_title')}[/bold cyan]")
    console.print("---------------------------------------")
    console.print("[bold]Usage:[/bold] python3 install-cyanly.pyz [command]\n")
    console.print("[bold]Commands:[/bold]")
    console.print(f"  [green]config[/green]     {t('help_config')}")
    console.print(f"  [green]gen[/green]        {t('help_gen')}")
    console.print(f"  [green]up[/green]         {t('help_up')}")
    console.print(f"  [green]install[/green]    {t('help_install')}")
    console.print(f"  [green]help[/green]       {t('help_help')}\n")


def main():
    init_lang()

    cmd = None
    skip_next = False
    for arg in sys.argv[1:]:
        if skip_next:
            skip_next = False
            continue
        if arg in ("--lang", "--dest"):
            skip_next = True
            continue
        if not arg.startswith("-"):
            cmd = arg.lower()
            break

    if not cmd:
        print_help()
        sys.exit(1)

    if cmd == "config" or cmd == "configure":
        do_config()
    elif cmd == "gen" or cmd == "generate":
        do_gen()
    elif cmd == "up":
        do_up()
    elif cmd == "install":
        do_install()
    elif cmd in ("help", "-h", "--help"):
        print_help()
    else:
        console.print(f"[bold red]{t('err_unknown_command')}: {cmd}[/bold red]")
        print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
