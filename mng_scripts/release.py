from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

VERSION_FILES = (
    ("JS SDK", ROOT_DIR / "sdk_js" / "package.json", "json"),
    ("Dashboard", ROOT_DIR / "dashboard" / "package.json", "json"),
    ("Installer", ROOT_DIR / "deployment" / "pyproject.toml", "toml"),
)

SEMVER_RE = re.compile(
    r"^(?P<major>0|[1-9]\d*)\."
    r"(?P<minor>0|[1-9]\d*)\."
    r"(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<channel>alpha|beta|rc)\.(?P<pre_num>0|[1-9]\d*))?$"
)


@dataclass(frozen=True)
class Version:
    major: int
    minor: int
    patch: int
    channel: str | None = None
    pre_num: int | None = None

    @classmethod
    def parse(cls, raw: str) -> "Version":
        match = SEMVER_RE.fullmatch(raw)
        if match is None:
            raise ValueError(
                f"invalid version {raw!r}; expected X.Y.Z or X.Y.Z-alpha.N/beta.N/rc.N"
            )
        channel = match.group("channel")
        pre_num = match.group("pre_num")
        return cls(
            major=int(match.group("major")),
            minor=int(match.group("minor")),
            patch=int(match.group("patch")),
            channel=channel,
            pre_num=int(pre_num) if pre_num is not None else None,
        )

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        if self.channel is None:
            return base
        return f"{base}-{self.channel}.{self.pre_num}"

    def sort_key(self) -> tuple[int, int, int, int, int]:
        channel_rank = {"alpha": 0, "beta": 1, "rc": 2}
        if self.channel is None:
            return (self.major, self.minor, self.patch, 3, 0)
        return (
            self.major,
            self.minor,
            self.patch,
            channel_rank[self.channel],
            self.pre_num or 0,
        )

    def bump(self, kind: str, prerelease_channel: str | None = None) -> "Version":
        if kind == "major":
            return Version(self.major + 1, 0, 0)
        if kind == "minor":
            return Version(self.major, self.minor + 1, 0)
        if kind == "patch":
            if self.channel is not None:
                return Version(self.major, self.minor, self.patch)
            return Version(self.major, self.minor, self.patch + 1)
        if kind == "prerelease":
            if prerelease_channel not in {"alpha", "beta", "rc"}:
                raise ValueError("prerelease channel must be alpha, beta, or rc")
            if self.channel is None:
                return Version(
                    self.major, self.minor, self.patch + 1, prerelease_channel, 0
                )
            if self.channel == prerelease_channel:
                return Version(
                    self.major,
                    self.minor,
                    self.patch,
                    prerelease_channel,
                    (self.pre_num or 0) + 1,
                )
            return Version(self.major, self.minor, self.patch, prerelease_channel, 0)
        raise ValueError(f"unsupported release kind {kind!r}")


def _read_json_version(path: Path) -> str:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    version = data.get("version")
    if not isinstance(version, str):
        raise ValueError(
            f"{path.relative_to(ROOT_DIR)} does not contain a string version"
        )
    return version


def _read_toml_version(path: Path) -> str:
    content = path.read_text(encoding="utf-8")
    match = re.search(r'(?m)^version\s*=\s*"([^"]+)"\s*$', content)
    if match is None:
        raise ValueError(
            f"{path.relative_to(ROOT_DIR)} does not contain a version field"
        )
    return match.group(1)


def read_versions() -> list[tuple[str, Path, str]]:
    versions: list[tuple[str, Path, str]] = []
    for label, path, file_type in VERSION_FILES:
        version = (
            _read_json_version(path)
            if file_type == "json"
            else _read_toml_version(path)
        )
        Version.parse(version)
        versions.append((label, path, version))
    return versions


def _write_json_version(path: Path, version: str) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = version
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _write_toml_version(path: Path, version: str) -> None:
    content = path.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'(?m)^(version\s*=\s*")[^"]+(")\s*$',
        rf"\g<1>{version}\g<2>",
        content,
        count=1,
    )
    if count != 1:
        raise ValueError(f"failed to update version in {path.relative_to(ROOT_DIR)}")
    path.write_text(updated, encoding="utf-8")


def write_versions(version: str) -> None:
    Version.parse(version)
    for _, path, file_type in VERSION_FILES:
        if file_type == "json":
            _write_json_version(path, version)
        else:
            _write_toml_version(path, version)


def print_versions(versions: list[tuple[str, Path, str]]) -> None:
    try:
        from rich.console import Console
        from rich.table import Table
    except ImportError:
        print("Current package versions:")
        for label, path, version in versions:
            print(f"  {label:10} {version:18} {path.relative_to(ROOT_DIR)}")
        return

    console = Console()
    table = Table(title="Current package versions")
    table.add_column("Package", style="cyan", no_wrap=True)
    table.add_column("Version", style="green", no_wrap=True)
    table.add_column("Manifest", style="dim")
    for label, path, version in versions:
        table.add_row(label, version, str(path.relative_to(ROOT_DIR)))
    console.print(table)


def _print(message: str, *, stderr: bool = False) -> None:
    try:
        from rich.console import Console
    except ImportError:
        print(
            re.sub(r"\[[/?a-zA-Z0-9 _.-]+\]", "", message),
            file=sys.stderr if stderr else None,
        )
        return

    Console(stderr=stderr).print(message)


def check_versions(tag: str = "") -> int:
    try:
        versions = read_versions()
    except ValueError as err:
        _print(f"[red]Release version check failed:[/red] {err}", stderr=True)
        return 1

    print_versions(versions)
    unique_versions = {version for _, _, version in versions}
    if len(unique_versions) != 1:
        _print(
            "[red]Release version check failed:[/red] package versions are not fixed.",
            stderr=True,
        )
        return 1

    version = next(iter(unique_versions))
    if tag:
        expected_tag = f"v{version}"
        if tag != expected_tag:
            _print(
                f"[red]Release version check failed:[/red] tag {tag!r} does not match "
                f"{expected_tag!r}.",
                stderr=True,
            )
            return 1

    _print("[green]Release version check passed.[/green]")
    return 0


def _prompt_choice(prompt: str, choices: tuple[str, ...]) -> str:
    if not sys.stdin.isatty():
        raise RuntimeError("interactive selection requires a TTY")

    import questionary

    selected = questionary.select(
        prompt,
        choices=list(choices),
        use_shortcuts=False,
    ).ask()
    if selected is None:
        raise RuntimeError("selection cancelled")
    return selected


def _confirm(prompt: str) -> bool:
    choice = _prompt_choice(prompt, ("no", "yes"))
    return choice == "yes"


def interactive_release() -> int:
    try:
        versions = read_versions()
    except ValueError as err:
        _print(f"[red]Cannot prepare release:[/red] {err}", stderr=True)
        return 1

    print_versions(versions)
    parsed_versions = [Version.parse(version) for _, _, version in versions]
    base = max(parsed_versions, key=lambda version: version.sort_key())
    if len({str(version) for version in parsed_versions}) != 1:
        _print(
            f"[yellow]Versions are not fixed.[/yellow] Using highest version as bump base: "
            f"[bold]{base}[/bold]"
        )

    try:
        release_kind = _prompt_choice(
            "Select release type",
            ("major", "minor", "patch", "prerelease"),
        )
        prerelease_channel = None
        if release_kind == "prerelease":
            prerelease_channel = _prompt_choice(
                "Select prerelease channel",
                ("alpha", "beta", "rc"),
            )

        next_version = base.bump(release_kind, prerelease_channel)
        confirmed = _confirm(f"Update all package versions to {next_version}?")
    except ImportError as err:
        _print(
            "[red]Cannot prepare release:[/red] rich is required for interactive release.",
            stderr=True,
        )
        _print(f"Import error: {err}", stderr=True)
        return 1
    except RuntimeError as err:
        _print(f"[yellow]Release version update cancelled:[/yellow] {err}", stderr=True)
        return 1

    if not confirmed:
        _print("[yellow]Release version update cancelled.[/yellow]")
        return 1

    write_versions(str(next_version))
    _print(f"[green]Updated fixed package version to {next_version}.[/green]")
    _print(f"Create the release tag with: [bold]git tag v{next_version}[/bold]")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Manage fixed cyanly release versions."
    )
    subparsers = parser.add_subparsers(dest="command")

    check_parser = subparsers.add_parser(
        "check", help="Validate fixed package versions."
    )
    check_parser.add_argument("--tag", default="", help="Optional git tag to compare.")

    args = parser.parse_args(argv)
    if args.command == "check":
        return check_versions(tag=args.tag)
    return interactive_release()


if __name__ == "__main__":
    raise SystemExit(main())
