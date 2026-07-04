import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import maxmind from "maxmind";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const COLLECT_ENDPOINT = "http://localhost:8080/collect";
const CLICKHOUSE_ENDPOINT = "http://localhost:8123/";
const SITE_ID = "test-no-token-site";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESTRICTED_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
  "IS",
  "LI",
  "NO",
  "CH",
]);

type PrivacyEventRow = {
  visitor_id: string;
  ip: string;
};

function dailyVisitorHash(
  ip: string,
  userAgent: string,
  siteId: string,
  secret: string,
  timestamp: Date,
): string {
  const date = timestamp.toISOString().slice(0, 10);
  const salt = crypto
    .createHash("sha256")
    .update(`${secret}:${date}`)
    .digest("hex");
  return crypto
    .createHash("sha256")
    .update(`${ip}:${userAgent}:${siteId}:${salt}`)
    .digest("hex");
}

function getHostIP(network: string): string {
  const base = network.split("/")[0];
  if (base.includes(".")) {
    const parts = base.split(".");
    parts[3] = "1";
    return parts.join(".");
  }
  return base;
}

async function findRestrictedIPv4(): Promise<string> {
  const csvPath = path.resolve(__dirname, "../../geoip_asn.csv");
  const ipv4Path = path.resolve(__dirname, "../../dbip-city-ipv4.mmdb");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("network"));
  const cityReader = await maxmind.open(ipv4Path);

  for (const line of lines) {
    const network = line.split(",")[0];
    if (!network.includes(".")) continue;
    const ip = getHostIP(network);
    const geo = cityReader.get(ip) as { country_code?: string } | undefined;
    if (geo?.country_code && RESTRICTED_COUNTRIES.has(geo.country_code)) {
      return ip;
    }
  }

  throw new Error("No restricted-region IPv4 address found in test data");
}

function maskIPv4(ip: string): string {
  const parts = ip.split(".");
  parts[3] = "0";
  return parts.join(".");
}

async function pollPrivacyEvent(
  request: APIRequestContext,
  sessionId: string,
): Promise<PrivacyEventRow | undefined> {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const chRes = await request.post(CLICKHOUSE_ENDPOINT, {
      data: `
        SELECT visitor_id, ip
        FROM cyanly.events
        WHERE site_id = '${SITE_ID}' AND session_id = '${sessionId}'
        ORDER BY timestamp DESC
        LIMIT 1
        FORMAT JSON
      `,
      headers: {
        "X-ClickHouse-User": "default",
        "X-ClickHouse-Key": "cyanly-password",
      },
    });
    expect(chRes.status()).toBe(200);
    const json = await chRes.json();
    if (json.data && json.data.length > 0) {
      return json.data[0];
    }
  }
  return undefined;
}

test.describe("Privacy anonymization pipeline", () => {
  test("should mask IP and replace visitor_id for restricted default regions without consent", async ({
    request,
  }) => {
    const ip = await findRestrictedIPv4();
    const userAgent = "cyanly-privacy-e2e/1.0";
    const sessionId = `privacy-de-${Date.now()}`;
    const timestampLowerBound = new Date();

    const collectRes = await request.post(COLLECT_ENDPOINT, {
      headers: {
        Origin: "http://localhost:13001",
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        "X-Forwarded-For": ip,
        "X-Forwarded-IP": ip,
        "X-Real-IP": ip,
      },
      data: {
        site_id: SITE_ID,
        visitor_id: "raw-visitor-restricted",
        session_id: sessionId,
        url: "http://localhost:13001/privacy-restricted",
        title: "Privacy Restricted",
      },
    });

    expect(collectRes.status()).toBe(200);

    const row = await pollPrivacyEvent(request, sessionId);
    expect(row).toBeDefined();
    expect(row?.ip).toBe(maskIPv4(ip));
    expect(row?.visitor_id).not.toBe("raw-visitor-restricted");

    const expectedToday = dailyVisitorHash(
      ip,
      userAgent,
      SITE_ID,
      "cyanly-jwt-secret-key-change-in-prod",
      new Date(),
    );
    const expectedAtSendTime = dailyVisitorHash(
      ip,
      userAgent,
      SITE_ID,
      "cyanly-jwt-secret-key-change-in-prod",
      timestampLowerBound,
    );
    expect([expectedToday, expectedAtSendTime]).toContain(row?.visitor_id);
  });

  test("should preserve IP and visitor_id for granted consent", async ({
    request,
  }) => {
    const ip = "2.16.0.2";
    const sessionId = `privacy-granted-${Date.now()}`;

    const collectRes = await request.post(COLLECT_ENDPOINT, {
      headers: {
        Origin: "http://localhost:13001",
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "X-Forwarded-IP": ip,
        "X-Real-IP": ip,
      },
      data: {
        site_id: SITE_ID,
        visitor_id: "raw-visitor-granted",
        session_id: sessionId,
        url: "http://localhost:13001/privacy-granted",
        title: "Privacy Granted",
        consent: "granted",
      },
    });

    expect(collectRes.status()).toBe(200);

    const row = await pollPrivacyEvent(request, sessionId);
    expect(row).toBeDefined();
    expect(row?.ip).toBe(ip);
    expect(row?.visitor_id).toBe("raw-visitor-granted");
  });

  test("should anonymize when GPC is set in a non-restricted region", async ({
    request,
  }) => {
    const ip = "8.8.8.8";
    const sessionId = `privacy-gpc-${Date.now()}`;

    const collectRes = await request.post(COLLECT_ENDPOINT, {
      headers: {
        Origin: "http://localhost:13001",
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "X-Forwarded-IP": ip,
        "X-Real-IP": ip,
      },
      data: {
        site_id: SITE_ID,
        visitor_id: "raw-visitor-gpc",
        session_id: sessionId,
        url: "http://localhost:13001/privacy-gpc",
        title: "Privacy GPC",
        gpc: true,
      },
    });

    expect(collectRes.status()).toBe(200);

    const row = await pollPrivacyEvent(request, sessionId);
    expect(row).toBeDefined();
    expect(row?.ip).toBe("8.8.8.0");
    expect(row?.visitor_id).not.toBe("raw-visitor-gpc");
  });
});
