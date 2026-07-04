import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


DEPLOYMENT_ROOT = Path(__file__).resolve().parents[1]
if str(DEPLOYMENT_ROOT) not in sys.path:
    sys.path.insert(0, str(DEPLOYMENT_ROOT))


@pytest.fixture
def isolated_installer(tmp_path, monkeypatch):
    from single_server_docker import installer

    home_dir = tmp_path / "home"
    work_dir = tmp_path / "work"
    install_dir = tmp_path / "install"
    home_dir.mkdir()
    work_dir.mkdir()

    monkeypatch.chdir(work_dir)
    monkeypatch.setenv("HOME", str(home_dir))
    monkeypatch.setattr(
        installer, "INSTALL_POINTER_PATH", home_dir / ".cyanly_installed"
    )
    monkeypatch.setattr(installer, "DEFAULT_INSTALL_DIR", home_dir / ".cyanly")
    monkeypatch.setattr(sys, "argv", ["install-cyanly.pyz", "--lang", "en", "-y"])
    (home_dir / ".cyanly_lang").write_text("en", encoding="utf-8")

    def fake_download_file_with_progress(url: str, dest_path: str):
        Path(dest_path).write_bytes(b"0" * (1024 * 1024 + 1))

    monkeypatch.setattr(
        installer, "download_file_with_progress", fake_download_file_with_progress
    )

    return SimpleNamespace(
        home_dir=home_dir,
        work_dir=work_dir,
        install_dir=install_dir,
        installer=installer,
    )
