import sys
import time


def clean_ports(ports_list, yes=False):
    # Cross-platform dependency check and bootstrap
    try:
        import psutil
    except ImportError:
        import subprocess

        print("psutil library is required for cross-platform process management.")
        print("Installing psutil...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
            import psutil

            print("Successfully installed psutil.")
        except Exception as e:
            print(
                f"Error: Failed to install psutil automatically: {e}", file=sys.stderr
            )
            print("Please run: pip install psutil", file=sys.stderr)
            sys.exit(1)

    print(f"Scanning ports: {', '.join(map(str, ports_list))}...")

    found = {}
    # Method 1: Iterate processes (most permission-friendly)
    try:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                conns = proc.net_connections(kind="inet")
                for conn in conns:
                    if conn.status == "LISTEN" and conn.laddr.port in ports_list:
                        found[conn.laddr.port] = {
                            "pid": proc.pid,
                            "name": proc.name(),
                            "cmdline": proc.cmdline()
                            if hasattr(proc, "cmdline")
                            else [],
                            "proc": proc,
                        }
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass

    # Method 2: System-wide connections fallback
    if len(found) < len(ports_list):
        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.status == "LISTEN" and conn.laddr.port in ports_list:
                    port = conn.laddr.port
                    if port not in found:
                        pid = conn.pid
                        if pid:
                            try:
                                proc = psutil.Process(pid)
                                found[port] = {
                                    "pid": pid,
                                    "name": proc.name(),
                                    "cmdline": proc.cmdline()
                                    if hasattr(proc, "cmdline")
                                    else [],
                                    "proc": proc,
                                }
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
        except Exception:
            pass

    if not found:
        print("No active processes found on the specified ports. Everything is clean!")
        return

    print("\nFound the following processes using the target ports:")
    print("-" * 75)
    for port, info in sorted(found.items()):
        cmd_str = " ".join(info["cmdline"])
        if len(cmd_str) > 50:
            cmd_str = cmd_str[:47] + "..."
        print(
            f"Port {port:5} | PID {info['pid']:6} | Process: {info['name']:15} | Cmd: {cmd_str}"
        )
    print("-" * 75)

    if yes:
        confirmed = True
    else:
        # Ask for user confirmation
        try:
            response = (
                input("\nAre you sure you want to terminate these processes? (y/N): ")
                .strip()
                .lower()
            )
            confirmed = response in ("y", "yes")
        except KeyboardInterrupt:
            print("\nOperation cancelled.")
            sys.exit(0)

    if confirmed:
        for port, info in found.items():
            proc = info["proc"]
            pid = info["pid"]
            name = info["name"]
            print(f"Terminating {name} (PID {pid}) on port {port}...")
            try:
                proc.terminate()
                # Wait for process to exit
                for _ in range(20):
                    if not proc.is_running():
                        break
                    time.sleep(0.1)

                # If still running, force kill
                if proc.is_running():
                    print(f"Process {pid} still running. Sending kill signal...")
                    proc.kill()
                print(f"Successfully cleaned port {port}.")
            except Exception as e:
                print(f"Error terminating process on port {port}: {e}", file=sys.stderr)
        print("\nAll target ports are now clean.")
    else:
        print("Cancelled. No processes were terminated.")


def clean_logs():
    import shutil
    from pathlib import Path

    logs_dir = Path("logs")
    if logs_dir.exists():
        print(f"Deleting logs directory: {logs_dir.resolve()}...")
        try:
            shutil.rmtree(logs_dir)
            print("Logs directory deleted successfully.")
        except Exception as e:
            print(f"Error deleting logs directory: {e}", file=sys.stderr)
    else:
        print("No logs directory found to delete.")
