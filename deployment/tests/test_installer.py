import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest
from ruamel.yaml import YAML


DEPLOYMENT_ROOT = Path(__file__).resolve().parents[1]


def prepare_preinstall(env):
    env.installer.do_config()


def load_yaml(content):
    return YAML(typ="safe").load(content)


def test_gen_generates_expected_files(isolated_installer, monkeypatch, snapshot):
    env = isolated_installer
    prepare_preinstall(env)
    monkeypatch.setattr(
        sys,
        "argv",
        ["install-cyanly.pyz", "gen", "--dest", str(env.install_dir), "-y"],
    )

    env.installer.do_gen()

    assert (env.install_dir / ".env").read_text(encoding="utf-8") == snapshot(
        name="env"
    )
    assert (
        env.install_dir / "docker-compose.yaml"
    ).read_text(encoding="utf-8") == snapshot(name="docker_compose")
    assert (env.install_dir / "chiyo_analytics.toml").read_text(
        encoding="utf-8"
    ) == (env.work_dir / "cyanly-preinstall" / "chiyo_analytics.toml").read_text(
        encoding="utf-8"
    )
    assert (env.install_dir / "cyanly.pyz").exists()
    assert (
        env.home_dir / ".cyanly_installed"
    ).read_text(encoding="utf-8").strip() == str(env.install_dir.resolve())

    for filename in ("dbip-city-ipv4.mmdb", "dbip-city-ipv6.mmdb", "origin-asn.mmdb"):
        assert (env.install_dir / "geoip" / filename).stat().st_size > 1024 * 1024


def test_parse_toml_preserves_nested_deploy_config(isolated_installer):
    config = isolated_installer.installer.parse_toml(
        """
        [postgres]
        addr = "db.example.com:5432"

        [postgres.deploy.single_server_docker]
        external = true
        host_port = 5433
        volume = "/mnt/data/postgres"
        """
    )

    deploy = config["postgres"]["deploy"]["single_server_docker"]
    assert deploy == {
        "external": True,
        "host_port": 5433,
        "volume": "/mnt/data/postgres",
    }


def test_render_compose_honors_host_ports_and_volumes(isolated_installer):
    config = isolated_installer.installer.parse_toml(
        """
        [postgres]
        addr = "cyanly-postgres:5432"
        database = "cyanly"
        username = "cyanly"
        password = "pg-secret"
        sslmode = "disable"

        [postgres.deploy.single_server_docker]
        host_port = 5433
        volume = "/mnt/data/postgres"

        [clickhouse]
        addr = "cyanly-clickhouse:9000"
        database = "cyanly"
        username = "default"
        password = "ch-secret"
        table = "cyanly.events"

        [clickhouse.deploy.single_server_docker]
        native_host_port = 19000
        http_host_port = 18123
        volume = "cyanly-clickhouse-prod"

        [redis]
        addr = "cyanly-redis:6379"
        password = ""
        db = 0
        key = "cyanly:events"

        [redis.deploy.single_server_docker]
        host_port = 6380
        """
    )

    rendered, _ = isolated_installer.installer.render_compose(config)
    compose = load_yaml(rendered)
    services = compose["services"]

    assert services["cyanly-postgres"]["ports"] == ["5433:5432"]
    assert services["cyanly-postgres"]["volumes"] == [
        "/mnt/data/postgres:/var/lib/postgresql"
    ]
    assert services["cyanly-clickhouse"]["ports"] == ["19000:9000", "18123:8123"]
    assert services["cyanly-clickhouse"]["volumes"] == [
        "cyanly-clickhouse-prod:/var/lib/clickhouse"
    ]
    assert services["cyanly-redis"]["ports"] == ["6380:6379"]
    assert "pg-data" not in compose["volumes"]
    assert "clickhouse-data" not in compose["volumes"]
    assert "cyanly-clickhouse-prod" in compose["volumes"]


def test_render_compose_removes_external_services_and_dependencies(
    isolated_installer,
):
    config = isolated_installer.installer.parse_toml(
        """
        [postgres]
        addr = "rds.example.com:5432"
        database = "cyanly"
        username = "cyanly"
        password = "pg-secret"
        sslmode = "require"

        [postgres.deploy.single_server_docker]
        external = true

        [clickhouse]
        addr = "clickhouse.example.com:9000"
        database = "cyanly"
        username = "default"
        password = "ch-secret"
        table = "cyanly.events"

        [clickhouse.deploy.single_server_docker]
        external = true

        [redis]
        addr = "redis.example.com:6379"
        password = ""
        db = 0
        key = "cyanly:events"

        [redis.deploy.single_server_docker]
        external = true
        """
    )

    rendered, _ = isolated_installer.installer.render_compose(config)
    compose = load_yaml(rendered)
    services = compose["services"]

    assert "cyanly-postgres" not in services
    assert "cyanly-clickhouse" not in services
    assert "cyanly-redis" not in services
    assert "depends_on" not in services["cyanly-migrate-pg"]
    assert "depends_on" not in services["cyanly-migrate-ch"]
    assert "cyanly-redis" not in services["cyanly-collector"]["depends_on"]
    assert "cyanly-redis" not in services["cyanly-worker"]["depends_on"]
    assert "volumes" not in compose
    assert (
        "postgres://cyanly:pg-secret@rds.example.com:5432/cyanly?sslmode=require"
        in services["cyanly-migrate-pg"]["command"]
    )
    assert (
        "clickhouse://default:ch-secret@clickhouse.example.com:9000/cyanly"
        in services["cyanly-migrate-ch"]["command"]
    )


def test_render_compose_omits_clickhouse_ports_independently(isolated_installer):
    config = isolated_installer.installer.parse_toml(
        """
        [clickhouse]
        addr = "cyanly-clickhouse:9000"
        database = "cyanly"
        username = "default"
        password = "ch-secret"
        table = "cyanly.events"

        [clickhouse.deploy.single_server_docker]
        http_host_port = 18123
        """
    )

    rendered, _ = isolated_installer.installer.render_compose(config)
    compose = load_yaml(rendered)

    assert compose["services"]["cyanly-clickhouse"]["ports"] == ["18123:8123"]


def test_render_compose_preserves_user_encoded_password(isolated_installer):
    config = isolated_installer.installer.parse_toml(
        """
        [postgres]
        addr = "cyanly-postgres:5432"
        database = "cyanly"
        username = "cyanly"
        password = "p%40ss%3Aword"
        sslmode = "disable"

        [clickhouse]
        addr = "cyanly-clickhouse:9000"
        database = "cyanly"
        username = "default"
        password = "ch%23secret"
        table = "cyanly.events"
        """
    )

    rendered, env_content = isolated_installer.installer.render_compose(config)
    compose = load_yaml(rendered)

    assert (
        "postgres://cyanly:p%40ss%3Aword@cyanly-postgres:5432/cyanly?sslmode=disable"
        in compose["services"]["cyanly-migrate-pg"]["command"]
    )
    assert (
        "clickhouse://default:ch%23secret@cyanly-clickhouse:9000/cyanly"
        in compose["services"]["cyanly-migrate-ch"]["command"]
    )
    assert "DB_PASSWORD=p%40ss%3Aword" in env_content
    assert "CH_PASSWORD=ch%23secret" in env_content


def test_resolve_install_dir_prefers_dest_then_pointer(isolated_installer, monkeypatch):
    env = isolated_installer
    explicit_dir = env.work_dir / "explicit"
    pointer_dir = env.work_dir / "recorded"
    pointer_dir.mkdir()

    monkeypatch.setattr(
        sys, "argv", ["install-cyanly.pyz", "gen", "--dest", str(explicit_dir)]
    )
    assert env.installer.resolve_install_dir() == explicit_dir

    (env.home_dir / ".cyanly_installed").write_text(
        str(pointer_dir), encoding="utf-8"
    )
    monkeypatch.setattr(sys, "argv", ["install-cyanly.pyz", "gen"])
    assert env.installer.resolve_install_dir() == pointer_dir


def test_resolve_install_dir_falls_back_when_pointer_is_invalid(
    isolated_installer, monkeypatch
):
    env = isolated_installer
    (env.home_dir / ".cyanly_installed").write_text(
        str(env.work_dir / "missing"), encoding="utf-8"
    )
    monkeypatch.setattr(sys, "argv", ["install-cyanly.pyz", "gen"])

    assert env.installer.resolve_install_dir() == env.home_dir / ".cyanly"


def test_gen_refuses_to_overwrite_existing_files(isolated_installer, monkeypatch):
    env = isolated_installer
    prepare_preinstall(env)
    env.install_dir.mkdir()
    existing_compose = env.install_dir / "docker-compose.yaml"
    existing_compose.write_text("original\n", encoding="utf-8")
    monkeypatch.setattr(
        sys, "argv", ["install-cyanly.pyz", "gen", "--dest", str(env.install_dir)]
    )
    monkeypatch.setattr(env.installer.Confirm, "ask", lambda *args, **kwargs: False)

    with pytest.raises(SystemExit):
        env.installer.do_gen()

    assert existing_compose.read_text(encoding="utf-8") == "original\n"
    assert not (env.home_dir / ".cyanly_installed").exists()


def test_gen_overwrites_existing_files_with_yes(isolated_installer, monkeypatch):
    env = isolated_installer
    prepare_preinstall(env)
    env.install_dir.mkdir()
    existing_env = env.install_dir / ".env"
    existing_env.write_text("old=true\n", encoding="utf-8")
    monkeypatch.setattr(
        sys,
        "argv",
        ["install-cyanly.pyz", "gen", "--dest", str(env.install_dir), "--yes"],
    )

    env.installer.do_gen()

    assert "DB_PASSWORD=" in existing_env.read_text(encoding="utf-8")


def test_config_refuses_to_overwrite_existing_template(isolated_installer, monkeypatch):
    env = isolated_installer
    preinstall_dir = env.work_dir / "cyanly-preinstall"
    preinstall_dir.mkdir()
    template_path = preinstall_dir / "chiyo_analytics.toml"
    template_path.write_text("original\n", encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["install-cyanly.pyz", "config"])
    monkeypatch.setattr(env.installer.Confirm, "ask", lambda *args, **kwargs: False)

    with pytest.raises(SystemExit):
        env.installer.do_config()

    assert template_path.read_text(encoding="utf-8") == "original\n"


def test_up_uses_pointer_and_runs_compose(isolated_installer, monkeypatch):
    env = isolated_installer
    env.install_dir.mkdir()
    (env.install_dir / "docker-compose.yaml").write_text(
        "services: {}\n", encoding="utf-8"
    )
    (env.home_dir / ".cyanly_installed").write_text(
        str(env.install_dir), encoding="utf-8"
    )
    monkeypatch.setattr(sys, "argv", ["install-cyanly.pyz", "up"])
    monkeypatch.setattr(env.installer, "find_compose_command", lambda: ["docker", "compose"])

    calls = []

    def fake_run(cmd, cwd=None, check=False):
        calls.append((cmd, cwd, check))
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(env.installer.subprocess, "run", fake_run)

    env.installer.do_up()

    assert calls == [(["docker", "compose", "up", "-d"], str(env.install_dir), True)]
    assert (
        env.home_dir / ".cyanly_installed"
    ).read_text(encoding="utf-8").strip() == str(env.install_dir.resolve())


def test_up_requires_generated_compose_file(isolated_installer, monkeypatch):
    env = isolated_installer
    monkeypatch.setattr(
        sys, "argv", ["install-cyanly.pyz", "up", "--dest", str(env.install_dir)]
    )

    with pytest.raises(SystemExit):
        env.installer.do_up()


def test_install_cli_dispatches_noninteractive_commands(monkeypatch):
    spec = importlib.util.spec_from_file_location(
        "install_cyanly_cli", DEPLOYMENT_ROOT / "install-cyanly.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    calls = []
    monkeypatch.setattr(module, "init_lang", lambda: "en")
    monkeypatch.setattr(module, "do_gen", lambda: calls.append("gen"))
    monkeypatch.setattr(module, "do_up", lambda: calls.append("up"))
    monkeypatch.setattr(module, "do_install", lambda: calls.append("install"))

    for command in ("gen", "up", "install"):
        monkeypatch.setattr(
            sys, "argv", ["install-cyanly.pyz", "--lang", "en", "-y", command]
        )
        module.main()

    assert calls == ["gen", "up", "install"]
