export async function Footer() {
  const currentYear = new Date().getFullYear();
  const copyrightYear = currentYear > 2026 ? `2026–${currentYear}` : "2026";

  return (
    <footer className="w-full border-t border-border bg-background py-6 pt-12">
      <div className="mx-auto px-4 flex flex-col items-end justify-end text-xs text-muted-foreground gap-1">
        <a href="https://db-ip.com" target="_blank">
          IP Geolocation by DB-IP
        </a>

        <a href="https://github.com/sapics/ip-location-db" target="_blank">
          Location Databases by sapics/ip-location-db
        </a>

        <div>© {copyrightYear} Chiyo Analytics. All rights reserved.</div>
      </div>
    </footer>
  );
}
