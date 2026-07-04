import csv
import os
import urllib.request

import maxminddb
from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TransferSpeedColumn,
)

console = Console()


def geoip_update(config_path="chiyo_analytics.toml"):
    urls = {}

    # Attempt to load custom source configuration from the TOML file
    if os.path.exists(config_path):
        try:
            import tomllib

            with open(config_path, "rb") as f:
                cfg = tomllib.load(f)
            updater_geoip = cfg.get("updater", {}).get("geoip", {})
            for val in updater_geoip.values():
                name = val.get("name")
                url = val.get("url")
                if name and url:
                    urls[name] = url
        except Exception as e:
            console.print(
                f"[yellow]Warning: failed to load GeoIP sources from {config_path} ({e}). Falling back to defaults.[/yellow]"
            )

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    for filename, url in urls.items():
        console.print(f"[cyan]Downloading {filename}...[/cyan]")
        tmp_filename = filename + ".tmp"
        try:
            req = urllib.request.Request(url, headers=headers)

            with urllib.request.urlopen(req) as response:
                total_size = int(response.info().get("Content-Length", 0))

                with Progress(
                    TextColumn("[bold blue]{task.description}"),
                    BarColumn(),
                    DownloadColumn(),
                    TransferSpeedColumn(),
                ) as progress:
                    task = progress.add_task(
                        f"Downloading {filename}", total=total_size
                    )

                    with open(tmp_filename, "wb") as out_file:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            out_file.write(chunk)
                            progress.update(task, advance=len(chunk))

            if os.path.exists(filename):
                os.remove(filename)
            os.rename(tmp_filename, filename)
            console.print(
                f"[green]Successfully downloaded and saved {filename}[/green]\n"
            )
        except Exception as e:
            console.print(f"[red]Failed to download {filename}: {e}[/red]\n")
            if os.path.exists(tmp_filename):
                os.remove(tmp_filename)


def geoip_asn_preview():
    db_path = "./origin-asn.mmdb"
    if not os.path.exists(db_path):
        console.print(
            f"[red]ASN database not found at {db_path}. Please run `geoip update` first.[/red]"
        )
        return

    console.print(f"[cyan]Previewing first 10 entries of {db_path}:[/cyan]")
    count = 0
    try:
        with maxminddb.open_database(db_path) as reader:
            for network, record in reader:
                asn = record.get("autonomous_system_number")
                org = record.get("autonomous_system_organization")
                console.print(f"Network: {network} | ASN: AS{asn} | Org: {org}")
                count += 1
                if count >= 10:
                    break
    except Exception as e:
        console.print(f"[red]Failed to read ASN database: {e}[/red]")


def geoip_asn_dump(output_path="geoip_asn.csv"):
    db_path = "./origin-asn.mmdb"
    if not os.path.exists(db_path):
        console.print(
            f"[red]ASN database not found at {db_path}. Please run `geoip update` first.[/red]"
        )
        return

    console.print(f"[cyan]Dumping ASN database to {output_path}...[/cyan]")
    try:
        with maxminddb.open_database(db_path) as reader:
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["network", "asn", "organization"])
                for network, record in reader:
                    asn = record.get("autonomous_system_number")
                    org = record.get("autonomous_system_organization")
                    writer.writerow(
                        [str(network), f"AS{asn}" if asn else "", org or ""]
                    )
        console.print(f"[green]Successfully dumped ASN data to {output_path}[/green]")
    except Exception as e:
        console.print(f"[red]Failed to dump ASN data: {e}[/red]")


def geoip_ipv4_preview():
    """
    Parse the IPv4 City database and print the first 10 records.
    """
    db_path = "./dbip-city-ipv4.mmdb"
    if not os.path.exists(db_path):
        console.print(
            f"[red]IPv4 City database not found at {db_path}. Please run `geoip update` first.[/red]"
        )
        return

    console.print(f"[cyan]Previewing first 10 entries of {db_path}:[/cyan]")
    count = 0
    try:
        with maxminddb.open_database(db_path) as reader:
            for network, record in reader:
                console.print(f"Network: {network} | Record: {record}")
                count += 1
                if count >= 10:
                    break
    except Exception as e:
        console.print(f"[red]Failed to read IPv4 City database: {e}[/red]")


def geoip_ipv6_preview():
    """
    Parse the IPv6 City database and print the first 10 records.
    """
    db_path = "./dbip-city-ipv6.mmdb"
    if not os.path.exists(db_path):
        console.print(
            f"[red]IPv6 City database not found at {db_path}. Please run `geoip update` first.[/red]"
        )
        return

    console.print(f"[cyan]Previewing first 10 entries of {db_path}:[/cyan]")
    count = 0
    try:
        with maxminddb.open_database(db_path) as reader:
            for network, record in reader:
                console.print(f"Network: {network} | Record: {record}")
                count += 1
                if count >= 10:
                    break
    except Exception as e:
        console.print(f"[red]Failed to read IPv6 City database: {e}[/red]")


def check_and_prepare_geoip_files(config_path="chiyo_analytics.toml"):
    """
    Check if the required GeoIP files (dbip-city-ipv4.mmdb, dbip-city-ipv6.mmdb, origin-asn.mmdb, and geoip_asn.csv)
    exist. If not, trigger download/dump logic automatically.
    """
    required_files = [
        "origin-asn.mmdb",
        "dbip-city-ipv4.mmdb",
        "dbip-city-ipv6.mmdb",
        "geoip_asn.csv",
    ]

    missing = [f for f in required_files if not os.path.exists(f)]
    if missing:
        console.print(
            f"[yellow]Required GeoIP/ASN files missing: {missing}. Preparing files...[/yellow]"
        )

        mmdb_missing = [f for f in missing if f.endswith(".mmdb")]
        if mmdb_missing:
            geoip_update(config_path)

        if "geoip_asn.csv" in missing or "origin-asn.mmdb" in mmdb_missing:
            geoip_asn_dump("geoip_asn.csv")
