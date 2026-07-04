import select
import sys
import termios
import time
import tty

from rich.layout import Layout
from rich.markup import escape
from rich.panel import Panel
from rich.text import Text


class TerminalCbreakContext:
    def __init__(self):
        self.fd = sys.stdin.fileno() if sys.stdin.isatty() else None
        self.old_settings = None

    def __enter__(self):
        if self.fd is not None:
            self.old_settings = termios.tcgetattr(self.fd)
            tty.setcbreak(self.fd)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.fd is not None and self.old_settings is not None:
            termios.tcsetattr(self.fd, termios.TCSADRAIN, self.old_settings)


def check_key() -> str | None:
    if sys.stdin.isatty():
        r, _, _ = select.select([sys.stdin], [], [], 0.0)
        if r:
            char = sys.stdin.read(1)
            if char == "\x1b":
                # Handle escape key or arrow key sequence
                r2, _, _ = select.select([sys.stdin], [], [], 0.01)
                if r2:
                    sys.stdin.read(2)  # Discard arrow key suffixes (e.g. '[A')
                return "escape"
            return char
    return None


def create_layout(focused: str | None = None) -> Layout:
    layout = Layout()
    layout.split(
        Layout(name="header", size=3),
        Layout(name="body"),
        Layout(name="footer", size=3),
    )

    if focused:
        layout["body"].split(Layout(name=focused))
    else:
        layout["body"].split_row(
            Layout(name="left"),
            Layout(name="right"),
        )
        layout["left"].split(
            Layout(name="collector"),
            Layout(name="worker"),
        )
        layout["right"].split(
            Layout(name="api"),
            Layout(name="dashboard"),
        )
    return layout


def update_layout(
    layout: Layout, services: dict, focused: str | None, start_time: float
):
    # 1. Update Header
    elapsed = int(time.time() - start_time)
    elapsed_str = (
        f"{elapsed // 3600:02d}:{(elapsed % 3600) // 60:02d}:{elapsed % 60:02d}"
    )

    status_parts = []
    for name, s in services.items():
        is_running = s.poll() is None
        dot = "[bold green]●[/bold green]" if is_running else "[bold red]○[/bold red]"
        status_parts.append(f"{name}: {dot}")

    header_text = Text.from_markup(
        f"🛠️  [bold blue]Chiyo Analytics Dev Control Panel[/bold blue]  |  "
        f"Status: {'  '.join(status_parts)}  |  "
        f"Uptime: [bold yellow]{elapsed_str}[/bold yellow]"
    )
    layout["header"].update(Panel(header_text, style="blue"))

    # 2. Update visible Body Panel(s)
    for name, s in services.items():
        try:
            pane = layout[name]
        except KeyError:
            continue  # Service pane is hidden in the current layout

        # Compile recent logs from deque
        log_lines = []
        for line, is_err in s.deque:
            if is_err:
                log_lines.append(f"[bold red]{escape(line)}[/bold red]")
            else:
                log_lines.append(escape(line))

        logs_text = Text.from_markup("\n".join(log_lines))

        is_running = s.poll() is None
        if is_running:
            status_flag = "[green]RUNNING[/green]"
            border_color = s.color
        else:
            status_flag = f"[red]EXITED ({s.exit_code})[/red]"
            border_color = "red"

        title = f"[bold {s.color}]{s.name.upper()}[/bold {s.color}] ({status_flag})"
        pane.update(
            Panel(
                logs_text,
                title=title,
                border_style=border_color,
                title_align="left",
            )
        )

    # 3. Update Footer
    if focused:
        footer_markup = (
            f"Currently Zoomed: [bold {services[focused].color}]{focused.upper()}[/bold {services[focused].color}]  |  "
            "Press [bold yellow]ESC[/bold yellow] to Return to Grid  |  "
            "Press [bold red]Ctrl+C[/bold red] to Exit"
        )
    else:
        footer_markup = (
            "Press [bold cyan]1[/bold cyan]-Collector | [bold cyan]2[/bold cyan]-Worker | [bold cyan]3[/bold cyan]-API | [bold cyan]4[/bold cyan]-Dashboard  |  "
            "Press [bold yellow]ESC[/bold yellow] to Restore Grid  |  "
            "Press [bold red]Ctrl+C[/bold red] to Exit"
        )
    layout["footer"].update(Panel(Text.from_markup(footer_markup), style="dim white"))
