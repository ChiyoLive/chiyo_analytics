import { test, expect } from "@playwright/test";
import crypto from "crypto";

const COLLECTOR_BASE = "http://localhost:8080";
const COLLECT_ENDPOINT = `${COLLECTOR_BASE}/collect`;
const GEO_ENDPOINT = `${COLLECTOR_BASE}/collect/geo`;
const SITE_ID = "test-site-id";

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

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// The PEM-encoded public key corresponding to PRIVATE_KEY above — i.e. exactly
// the material a JWKS exposes. An attacker who fetches the public JWKS would
// have this. Used to mount the classic RS256 → HS256 confusion attack.
const PUBLIC_KEY_PEM = crypto
  .createPublicKey(PRIVATE_KEY)
  .export({ type: "spki", format: "pem" })
  .toString();

// signJwtHS256 forges a token using HMAC-SHA256 with an arbitrary secret.
// Used to verify the collector rejects symmetric algorithms outright.
function signJwtHS256(payload: any, secret: string | Buffer, kid: string): string {
  const header = { alg: "HS256", typ: "JWT", kid };
  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const tokenInput = `${headerStr}.${payloadStr}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(tokenInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${tokenInput}.${signature}`;
}

// makeUnsignedToken builds an `alg: none` token with an empty signature.
function makeUnsignedToken(payload: any, kid: string): string {
  const header = { alg: "none", typ: "JWT", kid };
  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  return `${headerStr}.${payloadStr}.`;
}

// A freshly-generated attacker RSA keypair that the JWKS endpoint does NOT
// expose. A token signed with this should fail signature verification even
// though its structure and claims are otherwise valid.
const attackerKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

test.describe("Secure Token Validation at /collect (Asymmetric RS256 via JWKS)", () => {
  test("should reject event without token when secure tokens enabled (403)", async ({
    request,
  }) => {
    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-no-token",
        session_id: "s-no-token",
        url: "http://localhost:13001/test",
        title: "No Token Test",
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Secure token is required");
  });

  test("should reject event with garbage/invalid JWT (403)", async ({
    request,
  }) => {
    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-bad-jwt",
        session_id: "s-bad-jwt",
        url: "http://localhost:13001/test",
        title: "Bad JWT Test",
        token: "not.a.valid.jwt.token",
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });

  test("should reject event with site_id mismatch in JWT claims (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: "wrong-site",
      session_id: "s-site-mismatch",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-site-mismatch",
        session_id: "s-site-mismatch",
        url: "http://localhost:13001/test",
        title: "Site ID Mismatch Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Token site_id mismatch");
  });

  test("should reject event with session_id mismatch in JWT claims (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-in-token",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-session-mismatch",
        session_id: "s-in-body",
        url: "http://localhost:13001/test",
        title: "Session ID Mismatch Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Token session_id mismatch");
  });

  test("should accept event with correct secure token and matching claims (200)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-valid-token",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-valid-token",
        session_id: "s-valid-token",
        url: "http://localhost:13001/test",
        title: "Valid Token Test",
        token: token,
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  // #1 — Expired token
  test("should reject event with an expired token (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-expired",
      exp: Math.floor(Date.now() / 1000) - 3600, // expired one hour ago
      iat: Math.floor(Date.now() / 1000) - 7200,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-expired",
        session_id: "s-expired",
        url: "http://localhost:13001/test",
        title: "Expired Token Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });

  // #2a — Algorithm confusion: RS256 → HS256 using the public key as HMAC secret
  test("should reject HS256 token signed with the JWKS public key (algorithm confusion, 403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-alg-confusion",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    // Classic attack: sign with HS256 using the PEM public key bytes as the
    // shared secret. A naive verifier that picks the algorithm from the token
    // header would treat the public key as an HMAC secret and accept this.
    const token = signJwtHS256(payload, PUBLIC_KEY_PEM, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-alg-confusion",
        session_id: "s-alg-confusion",
        url: "http://localhost:13001/test",
        title: "Algorithm Confusion Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });

  // #2b — Algorithm confusion: unsigned `alg: none` token
  test("should reject an unsigned alg:none token (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-alg-none",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeUnsignedToken(payload, "test-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-alg-none",
        session_id: "s-alg-none",
        url: "http://localhost:13001/test",
        title: "Alg None Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });

  // #3 — Forged signature: valid structure & claims, signed with an attacker key
  test("should reject a token signed with an unknown (attacker) private key (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-forged-sig",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    // Signed with an attacker keypair NOT present in the JWKS, but using the
    // legitimate kid so the collector fetches the real public key and the
    // RSA signature verification fails.
    const token = signJwtRS256(
      payload,
      attackerKeyPair.privateKey,
      "test-key-id",
    );

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-forged-sig",
        session_id: "s-forged-sig",
        url: "http://localhost:13001/test",
        title: "Forged Signature Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });

  // #4 — Unknown kid (exercises the JWKS cache refetch rate-limit path)
  test("should reject a token carrying an unknown kid (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "s-unknown-kid",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "nonexistent-key-id");

    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: SITE_ID,
        visitor_id: "v-unknown-kid",
        session_id: "s-unknown-kid",
        url: "http://localhost:13001/test",
        title: "Unknown Kid Test",
        token: token,
      },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired secure token");
  });
});

test.describe("Secure Token Validation at /collect/geo", () => {
  test("should reject unknown site_id (403)", async ({ request }) => {
    const res = await request.get(GEO_ENDPOINT, {
      params: { site_id: "unknown-site" },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized or unknown site_id");
  });

  test("should reject secure site without token (403)", async ({ request }) => {
    const res = await request.get(GEO_ENDPOINT, {
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Secure token is required");
  });

  test("should reject secure site with site_id mismatch in token (403)", async ({
    request,
  }) => {
    const payload = {
      site_id: "wrong-site",
      session_id: "geo-session",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.get(GEO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Token site_id mismatch");
  });

  test("should accept secure site with valid token (200)", async ({ request }) => {
    const payload = {
      site_id: SITE_ID,
      session_id: "geo-session",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = signJwtRS256(payload, PRIVATE_KEY, "test-key-id");

    const res = await request.get(GEO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.country).toBe("string");
  });
});

// #6 — Positive path for a site configured WITHOUT a jwks_url: token is optional
test.describe("Sites without a configured jwks_url (token verification disabled)", () => {
  const NO_TOKEN_SITE = "test-no-token-site";

  test("should accept an event without any token (200)", async ({
    request,
  }) => {
    const res = await request.post(COLLECT_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: NO_TOKEN_SITE,
        visitor_id: "v-no-jwks",
        session_id: "s-no-jwks",
        url: "http://localhost:13001/test",
        title: "No JWKS Site Test",
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  test("should accept geo lookup without any token (200)", async ({ request }) => {
    const res = await request.get(GEO_ENDPOINT, {
      params: { site_id: NO_TOKEN_SITE },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.country).toBe("string");
  });
});
