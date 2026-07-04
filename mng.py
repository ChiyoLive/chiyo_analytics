import fire

from mng_scripts.dev_runner import dev as run_dev


class CleanCmd:
    def port(self, ports="8079,8080,8081,8082"):
        """
        Identify and clean up processes listening on the specified ports.
        Displays details of running processes and prompts the user for confirmation.

        Args:
            ports: Comma-separated list of ports to clean (default: '8079,8080,8081,8082').
        """
        from mng_scripts.cleaner import clean_ports

        ports_list = [int(p.strip()) for p in ports.split(",") if p.strip()]
        clean_ports(ports_list)

    def logs(self):
        """
        Clean up the logs directory by deleting it.
        """
        from mng_scripts.cleaner import clean_logs

        clean_logs()


class TestCmd:
    def e2e(self, config="", test_file=""):
        """
        Run the complete E2E test suite.
        Tears down/up dev containers, executes database migrations, launches
        all services and examples, runs Playwright E2E tests, and cleans up.
        """
        from mng_scripts.e2e_runner import e2e as run_e2e

        run_e2e(config=config, test_file=test_file)

    def sdk_js(self):
        """
        Run the JS SDK test suite using Vitest.
        """
        import subprocess
        from pathlib import Path
        import sys

        root_dir = Path(__file__).resolve().parent
        print("Running JS SDK tests...")
        res = subprocess.run(["pnpm", "test"], cwd=root_dir / "sdk_js")
        if res.returncode != 0:
            sys.exit(res.returncode)

    def backend(self):
        """
        Run the Go backend unit tests.
        """
        import subprocess
        from pathlib import Path
        import sys

        root_dir = Path(__file__).resolve().parent
        print("Running Go backend unit tests...")
        res = subprocess.run(["go", "test", "-v", "./backend/..."], cwd=root_dir)
        if res.returncode != 0:
            sys.exit(res.returncode)

    def unit(self):
        """
        Run both the JS SDK tests and Go backend unit tests sequentially.
        """
        print("=== Step 1: Running JS SDK tests ===")
        self.sdk_js()
        print("\n=== Step 2: Running Go backend unit tests ===")
        self.backend()
        print("\nAll unit tests passed successfully!")

    def all(self, config="", test_file=""):
        """
        Run all unit tests followed by the E2E test suite.
        """
        print("=== Running All Unit Tests ===")
        self.unit()
        print("\n=== Running E2E Integration Tests ===")
        self.e2e(config=config, test_file=test_file)




class GeoIPCmd:
    def update(self):
        """
        Download the required GeoIP databases (dbip-city-ipv4.mmdb, dbip-city-ipv6.mmdb, origin-asn.mmdb)
        from sapics/ip-location-db, overwriting existing files.
        """
        from mng_scripts.geoip_mng import geoip_update

        geoip_update()

    def ipv4_preview(self):
        """
        Parse the IPv4 City database and print the first 10 records.
        """
        from mng_scripts.geoip_mng import geoip_ipv4_preview

        geoip_ipv4_preview()

    def ipv6_preview(self):
        """
        Parse the IPv6 City database and print the first 10 records.
        """
        from mng_scripts.geoip_mng import geoip_ipv6_preview

        geoip_ipv6_preview()

    def asn_preview(self):
        """
        Parse the ASN database and print the first 10 records.
        """
        from mng_scripts.geoip_mng import geoip_asn_preview

        geoip_asn_preview()

    def asn_dump(self, output="geoip_asn.csv"):
        """
        Dump all ASN database records to a CSV file.
        """
        from mng_scripts.geoip_mng import geoip_asn_dump

        geoip_asn_dump(output)


class Mng:
    def __init__(self):
        self.clean = CleanCmd()
        self.test = TestCmd()
        self.geoip = GeoIPCmd()

    def dev(self, config="", dashboard_cmd="pnpm dev"):
        """
        Start collector, worker, api, and dashboard simultaneously in a single terminal.
        Renders a 2x2 grid layout displaying logs for each service, with support for
        zooming in/out on specific services, and saves raw logs to the logs/ directory.

        Args:
            config: Optional path to the configuration file (resolved to absolute path).
            dashboard_cmd: Command to start the dashboard development server (default: 'pnpm dev').
        """
        run_dev(config=config, dashboard_cmd=dashboard_cmd)


if __name__ == "__main__":
    fire.Fire(Mng)
