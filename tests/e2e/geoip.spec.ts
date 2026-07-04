import { test, expect } from "@playwright/test";
import maxmind from "maxmind";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("GeoIP & ASN Processing Pipeline", () => {
  test("should correctly parse and store geoip and asn data from HTTP header", async ({ request }) => {
    // 1. Read a random IP from geoip_asn.csv
    const csvPath = path.resolve(__dirname, "../../geoip_asn.csv");
    expect(fs.existsSync(csvPath)).toBe(true);
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.split("\n").filter(l => l.trim() && !l.startsWith("network"));
    expect(lines.length).toBeGreaterThan(0);
    
    // Pick a random line
    const randomLine = lines[Math.floor(Math.random() * lines.length)];
    // Format: network,asn,organization
    const parts = randomLine.split(",");
    const network = parts[0];
    const testIP = getHostIP(network);
    
    console.log(`Testing IP: ${testIP} from network ${network}`);

    // 2. Resolve using JS maxmind reader locally
    const ipv4Path = path.resolve(__dirname, "../../dbip-city-ipv4.mmdb");
    const ipv6Path = path.resolve(__dirname, "../../dbip-city-ipv6.mmdb");
    const asnPath = path.resolve(__dirname, "../../origin-asn.mmdb");
    
    const cityReader = await maxmind.open(testIP.includes(".") ? ipv4Path : ipv6Path);
    const asnReader = await maxmind.open(asnPath);
    
    const expectedGeo = cityReader.get(testIP) as any;
    const expectedASN = asnReader.get(testIP) as any;
    
    // Extract expected values (mimicking Go Parser logic)
    let expectedCountry = "Unknown";
    let expectedCountryCode = "Unknown";
    let expectedRegion = "Unknown";
    let expectedCity = "Unknown";
    
    if (expectedGeo) {
      if (expectedGeo.country_code) {
        expectedCountryCode = expectedGeo.country_code;
        expectedCountry = expectedGeo.country_code;
      }
      if (expectedGeo.state1) {
        expectedRegion = expectedGeo.state1;
      }
      if (expectedGeo.city) {
        expectedCity = expectedGeo.city;
      }
    }
    
    let expectedAsNum: number | null = null;
    let expectedAsOrg: string | null = null;
    if (expectedASN && expectedASN.autonomous_system_number) {
      expectedAsNum = expectedASN.autonomous_system_number;
      expectedAsOrg = expectedASN.autonomous_system_organization || null;
    }
    
    // 3. Send a telemetry event via collector with X-Forwarded-For header spoofing
    const visitorId = `visitor-geoip-${Date.now()}`;
    const collectRes = await request.post("http://localhost:8080/collect", {
      headers: {
        Origin: "http://localhost:13001",
        "Content-Type": "application/json",
        "X-Forwarded-For": testIP,
        "X-Forwarded-IP": testIP,
        "X-Real-IP": testIP,
      },
      data: {
        site_id: "test-no-token-site",
        visitor_id: visitorId,
        session_id: `session-${Date.now()}`,
        url: "http://localhost:13001/products",
        title: "Test Products",
        consent: "granted",
      },
    });
    
    expect(collectRes.status()).toBe(200);
    
    // 4. Poll ClickHouse HTTP interface directly to wait for event write & assert values
    console.log("Polling ClickHouse for event insertion...");
    let found = false;
    let clickhouseData: any = null;
    
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const chRes = await request.post("http://localhost:8123/", {
        data: `SELECT country, country_code, region, city, ip_asn, ip_asn_name FROM cyanly.events WHERE visitor_id = '${visitorId}' FORMAT JSON`,
        headers: {
          "X-ClickHouse-User": "default",
          "X-ClickHouse-Key": "cyanly-password"
        }
      });
      if (chRes.status() !== 200) {
        console.log(`ClickHouse error: ${chRes.status()} - ${await chRes.text()}`);
      }
      expect(chRes.status()).toBe(200);
      const resJSON = await chRes.json();
      if (resJSON.data && resJSON.data.length > 0) {
        found = true;
        clickhouseData = resJSON.data[0];
        break;
      }
    }
    
    expect(found).toBe(true);
    console.log("ClickHouse received data:", clickhouseData);
    
    // 5. Assert values match expected local parsing results
    expect(clickhouseData.country).toBe(expectedCountry);
    expect(clickhouseData.country_code).toBe(expectedCountryCode);
    expect(clickhouseData.region).toBe(expectedRegion);
    expect(clickhouseData.city).toBe(expectedCity);
    
    if (expectedAsNum !== null) {
      expect(clickhouseData.ip_asn).toBe(expectedAsNum);
    } else {
      expect(clickhouseData.ip_asn).toBeNull();
    }
    
    if (expectedAsOrg !== null) {
      expect(clickhouseData.ip_asn_name).toBe(expectedAsOrg);
    } else {
      expect(clickhouseData.ip_asn_name).toBeNull();
    }
  });
});

function getHostIP(network: string): string {
  const cidr = network.split("/");
  const base = cidr[0];
  if (base.includes(".")) {
    const parts = base.split(".");
    parts[3] = "1";
    return parts.join(".");
  } else if (base.includes(":")) {
    if (base.endsWith("::")) {
      return base + "1";
    }
    return base;
  }
  return base;
}
