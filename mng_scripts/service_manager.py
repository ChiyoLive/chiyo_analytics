import os
import signal
import subprocess
import threading
import time
from collections import deque
from pathlib import Path


class Service:
    def __init__(
        self,
        name: str,
        cmd: list,
        cwd: Path,
        color: str,
        log_dir: Path,
        max_lines: int = 150,
    ):
        self.name = name
        self.cmd = cmd
        self.cwd = Path(cwd)
        self.color = color
        self.max_lines = max_lines
        self.deque = deque(maxlen=max_lines)
        self.proc = None
        self.log_path = Path(log_dir) / f"{name}.log"
        self._log_file = None
        self.exit_code = None

    def start(self):
        # Ensure log directory exists
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        # Open log file in append mode, buffered by line
        self._log_file = open(self.log_path, "a", encoding="utf-8", buffering=1)
        # Write starting session banner
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        self._log_file.write(f"\n--- Session Started at {timestamp} ---\n")

        self.proc = subprocess.Popen(
            self.cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(self.cwd),
            text=True,
            bufsize=1,
            errors="replace",
            preexec_fn=os.setsid,
        )

        # Start reader threads
        t_out = threading.Thread(
            target=self._read_stream, args=(self.proc.stdout, False), daemon=True
        )
        t_err = threading.Thread(
            target=self._read_stream, args=(self.proc.stderr, True), daemon=True
        )
        t_out.start()
        t_err.start()

    def _read_stream(self, stream, is_stderr: bool):
        for line in iter(stream.readline, ""):
            # Write to raw log file
            if self._log_file and not self._log_file.closed:
                try:
                    self._log_file.write(line)
                except Exception:
                    pass
            # Append to in-memory deque
            self.deque.append((line.rstrip("\r\n"), is_stderr))

    def poll(self):
        if self.proc is None:
            return None
        ret = self.proc.poll()
        if ret is not None:
            self.exit_code = ret
            self.close_log_file()
        return ret

    def close_log_file(self):
        if self._log_file:
            try:
                self._log_file.close()
            except Exception:
                pass
            self._log_file = None

    def terminate(self):
        if self.proc and self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
            except Exception:
                try:
                    self.proc.terminate()
                except Exception:
                    pass

    def kill(self):
        if self.proc and self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGKILL)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
        self.close_log_file()


class ServiceManager:
    def __init__(self, services_config: dict, log_dir: Path):
        self.services = {}
        for name, cfg in services_config.items():
            self.services[name] = Service(
                name=name,
                cmd=cfg["cmd"],
                cwd=cfg["cwd"],
                color=cfg["color"],
                log_dir=log_dir,
            )

    def start_all(self):
        for service in self.services.values():
            service.start()

    def poll_any(self):
        """
        Check if any service has exited. Return (name, exit_code) if exited, else None.
        """
        for name, service in self.services.items():
            ret = service.poll()
            if ret is not None:
                return name, ret
        return None

    def shutdown(self):
        # Terminate
        for service in self.services.values():
            service.terminate()

        # Wait for all to exit (up to 3.0 seconds)
        start_time = time.time()
        while time.time() - start_time < 3.0:
            if all(s.poll() is not None for s in self.services.values()):
                break
            time.sleep(0.1)

        # Force kill any still running
        for service in self.services.values():
            if service.poll() is None:
                service.kill()
