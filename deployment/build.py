import os
import subprocess
from pathlib import Path


def main():
    deploy_dir = Path(__file__).resolve().parent
    root_dir = deploy_dir.parent

    # 1. 拷贝 geoip_mng.py 并加上警告注释头
    src_geoip = root_dir / "mng_scripts" / "geoip_mng.py"
    dest_geoip = deploy_dir / "common" / "geoip_mng.py"

    if not src_geoip.exists():
        print(f"[-] 错误: 找不到源文件 {src_geoip}")
        return

    print(f"[*] 正在拷贝 {src_geoip.name} -> {dest_geoip.name} ...")
    os.makedirs(dest_geoip.parent, exist_ok=True)

    with open(src_geoip, "r", encoding="utf-8") as f:
        content = f.read()

    header = "# copy from ../mng_scripts/geoip_mng.py DO NOT EDIT\n\n"
    with open(dest_geoip, "w", encoding="utf-8") as f:
        f.write(header + content)

    print("[*] 正在通过 shiv 构建 cyanly.pyz ...")
    venv_python = root_dir / ".venv" / "bin" / "python3"
    if not venv_python.exists():
        # 回退至系统 Python
        venv_python = "python3"

    dist_dir = deploy_dir / "dist"
    cyanly_internal_path = deploy_dir / "single_server_docker" / "cyanly.pyz"
    install_cyanly_path = dist_dir / "install-cyanly.pyz"
    cyanly_dist_path = dist_dir / "cyanly.pyz"

    print("[*] 正在清理旧的构建文件...")
    import shutil
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(exist_ok=True)
    if cyanly_internal_path.exists():
        cyanly_internal_path.unlink()

    # 1. Build cyanly.pyz (using cyanly.py as entrypoint)
    print("[*] 正在通过 shiv 构建 cyanly.pyz ...")
    cmd_cyanly = [
        str(venv_python),
        "-m",
        "shiv",
        "-e",
        "cyanly:main",
        "-o",
        str(cyanly_internal_path),
        ".",
    ]
    try:
        subprocess.run(cmd_cyanly, cwd=str(deploy_dir), check=True)
        print("[+] 成功构建 cyanly.pyz")
        # 拷贝一份到 dist/ 下
        shutil.copy(cyanly_internal_path, cyanly_dist_path)
    except subprocess.CalledProcessError as e:
        print(f"[-] 错误: shiv 构建 cyanly.pyz 失败: {e}")
        return

    # 2. Build install-cyanly.pyz (using install-cyanly.py as entrypoint)
    print("[*] 正在通过 shiv 构建 install-cyanly.pyz ...")
    cmd_install = [
        str(venv_python),
        "-m",
        "shiv",
        "-e",
        "install-cyanly:main",
        "-o",
        str(install_cyanly_path),
        ".",
    ]

    try:
        subprocess.run(cmd_install, cwd=str(deploy_dir), check=True)
        print(f"[+] 成功构建 install-cyanly.pyz 到 {install_cyanly_path}！")
    except subprocess.CalledProcessError as e:
        print(f"[-] 错误: shiv 构建失败: {e}")


if __name__ == "__main__":
    main()
