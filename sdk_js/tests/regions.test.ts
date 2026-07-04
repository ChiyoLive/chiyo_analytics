import { describe, expect, it } from "vitest";
import { requiresDefaultAnonymization } from "../src/lib/regions";

describe("region privacy policy", () => {
  it("should require default anonymization for EU, EEA, UK and Switzerland", () => {
    expect(requiresDefaultAnonymization("DE")).toBe(true);
    expect(requiresDefaultAnonymization("gb")).toBe(true);
    expect(requiresDefaultAnonymization("NO")).toBe(true);
    expect(requiresDefaultAnonymization("CH")).toBe(true);
  });

  it("should not require default anonymization for US and JP", () => {
    expect(requiresDefaultAnonymization("US")).toBe(false);
    expect(requiresDefaultAnonymization("JP")).toBe(false);
  });
});
