import { test, expect } from "@playwright/test";

const PROBES = [
  { service: "collector", baseURL: "http://localhost:8080" },
  { service: "api", baseURL: "http://localhost:8081" },
  { service: "worker", baseURL: "http://localhost:8082" },
] as const;

test.describe("Health probes", () => {
  for (const probe of PROBES) {
    test(`${probe.service} exposes unauthenticated healthz`, async ({ request }) => {
      const res = await request.get(`${probe.baseURL}/healthz`);

      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ status: "healthy" });
    });

    test(`${probe.service} exposes unauthenticated readyz`, async ({ request }) => {
      const res = await request.get(`${probe.baseURL}/readyz`);

      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ status: "ready" });
    });
  }
});
