import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 13003;

// Serve static HTML files and JS assets
app.use(express.static(path.join(__dirname, "public")));

// Body parsing middleware to parse beacon payloads
app.use(express.json());
app.use(express.text({ type: "*/*" }));

// In-memory log store
const logs: any[] = [];

app.post("/api/logs", (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === "string") {
      payload = JSON.parse(payload);
    }

    if (payload && (payload.url || payload.visitor_id)) {
      const logItem = {
        timestamp: new Date().toLocaleTimeString(),
        url: payload.url || "",
        title: payload.title || "",
        durationMs: payload.duration_ms || 0,
        visitorId: payload.visitor_id || "",
        sessionId: payload.session_id || "",
      };

      logs.unshift(logItem);
      if (logs.length > 20) {
        logs.pop();
      }
    }
  } catch (e) {
    console.error("Failed to parse beacon event payload:", e);
  }
  res.sendStatus(204); // No Content (standard beacon response)
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

import crypto from "node:crypto";

// ⚠️ 仅供示例/测试使用 (FOR DEMO/TESTING ONLY)
// 这是一个公开的、硬编码的测试密钥对，切勿用于生产环境。
// 生产环境中，私钥必须保密并安全存储（如环境变量或密钥管理服务），
// 绝不能提交到代码仓库。对应公钥通过 /api/cyanly-jwks 暴露。
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCtKe/+YB53kyQW
b+14PPnEyTk5xg2xFbeV+0ahiNx5B/nqcjIASd/Qf9QwlbenatgJjg4BVn/QGbSQ
VoTuBnjhwv+6phFTBYJxOl/kNDv6oBXWkvdf9werAEdBLU7ta5E3i6RNWa8M+WPk
cIhdsk4qMWwshWAEE41i4p2Q/pKQZFi/wPM2rcLYA9O+kdaBIW24p1dWNo4/wU65
oPBIQW5aI0Oz3lx+F1tdo2M/zS9LPiZP8iIQ016TPw3f5Hl/BsirBoS9nEDaR3FF
hmn/gTfgCgh3w5cPyo99rgH+Wc+6UvLkk0yeR2flMA/gsc92o+SakPG5w4URNRSL
JdbJOmrfAgMBAAECggEAVj8QhwhVtGXHcBtwUdZA6rf0dieEU0KHTT65Z6Q0d123
JoOZDta8kGrSgx5Wuh53mo6zwAvWng3nhoppK+pyU7OdTlf/QfP5C68w6obvpr0M
E3Lgnd36Zju9waMw8ASG7/zvqQz1qIcgLzuzV8OCtfYmtCf78hvQ7EMFip2Y3ywg
1I/NOcOkNo2gimiS2/R6wUZR2tionIqbV2x92HpW94qtSXjKT5VPWgmgmRv0rl/R
yKo222liqX5BaShvW1TtxvzXg8PuVaicrtW0qTyiZ/OCZ+M6blTdxa+uJGmbpu8H
90bbmSdo7yEQqGesEM7S6FVm692AlkwGA1ycBGeBjQKBgQDouRMBENhXo3K+z+44
vP7qOKO4i+BXzRDIry9I7dOdKuRdnBd3I2vTfk7AOtl9VjbjP2uhaNa+0CMbDzFX
KPsLSRTAqSuXAMs0BJqjHekatoaWnjrd9CIjChl1m3qERn5EY92QaAq/3r7MnH40
VYg6rzy47IGm0bytL/VKOI4iJQKBgQC+e9Z3npwLjKRx4W1UlMABukEHODXFeKL2
3+TvvwjfiKn7Q2ba35CgaeOdDJQf7QxfzPS6i/JtibdkoVqm3HwII/5NdwAte2Vb
9V9WGD6IWETSPwG9EXO+Lj8fTeINDBLGEWIQxciBDtqTxdMMw3NTHzvmQSSMXfNO
Mo4lTpjvswKBgQCW2cigyzuA61joqL2hF5khV9+AM2MTZsB3ZV8AJfEiknf+2bw4
JMSzDc+cOUlbPjRL74Mj2GJCw4XN93YjKlQ4R4HlNIMl2YTeThGypCPChggNv7km
wCYUkmpYWpT7Avq7+APZpCc7ofYJiXMhF0Q7zfVNZTjRWmiz1j9ogepX5QKBgQCr
cLgJt4aI2o+TM6p8KtlZdLJcdhnnXnmGKuNZaJ3q2ozq6bIkIn1/8236Br02stql
SsmlMJoEPqQB/Tui3OUBSqvyOr29Mcd7aa/hxDZb7t4aQL0m1xNOQz9qxGVFCu3G
uRSDNhANIDpYL/+RCES+tmjqBw2HDHQUmGnZaBE8AwKBgQDIOeEGfqOC2LmEvLGn
s+UKc8Bvxzuoe/p1HMgfFur8pC/LLgUSjG3Zn49etQ+D15kQ1+kjyiOkdTMQ/HQp
RuhDpqWtq29DwrFosUdjdmC+VOG9MTgORXfkD8uxo433/I0t75pfI/NVv0Q3S42y
DM+USUqRKhV5Z14/UTp63WQydg==
-----END PRIVATE KEY-----`;

function signJwtRS256(
  payload: any,
  privateKeyPem: string,
  kid: string,
): string {
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: kid,
  };

  const base64UrlEncode = (str: string): string => {
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const tokenInput = `${headerStr}.${payloadStr}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(tokenInput);
  const signature = signer
    .sign(privateKeyPem, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${tokenInput}.${signature}`;
}

app.get("/api/cyanly-token", (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId query parameter is required" });
      return;
    }

    const payload = {
      site_id: "example-traditional-mpa",
      session_id: sessionId,
      exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes short-lived token for testing
      iat: Math.floor(Date.now() / 1000),
    };

    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");
    res.json({ token });
  } catch (error) {
    console.error("[Web Example Server] Error generating token:", error);
    res.status(500).json({ error: `${error}` || "Internal Server Error" });
  }
});

app.get("/api/cyanly-jwks", (req, res) => {
  // ⚠️ 仅供示例/测试使用：这是上面测试私钥对应的公钥。
  const jwks = {
    keys: [
      {
        kty: "RSA",
        n: "rSnv_mAed5MkFm_teDz5xMk5OcYNsRW3lftGoYjceQf56nIyAEnf0H_UMJW3p2rYCY4OAVZ_0Bm0kFaE7gZ44cL_uqYRUwWCcTpf5DQ7-qAV1pL3X_cHqwBHQS1O7WuRN4ukTVmvDPlj5HCIXbJOKjFsLIVgBBONYuKdkP6SkGRYv8DzNq3C2APTvpHWgSFtuKdXVjaOP8FOuaDwSEFuWiNDs95cfhdbXaNjP80vSz4mT_IiENNekz8N3-R5fwbIqwaEvZxA2kdxRYZp_4E34AoId8OXD8qPfa4B_lnPulLy5JNMnkdn5TAP4LHPdqPkmpDxucOFETUUiyXWyTpq3w",
        e: "AQAB",
        kid: "test-key-id",
        alg: "RS256",
        use: "sig",
      },
    ],
  };
  res.json(jwks);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Example web app running at http://localhost:${PORT}`);
});
