import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readDeclarativeProps } from "../src/lib/declarative";

type MockAttr = {
  name: string;
  value: string;
};

type MockElement = {
  attributes: MockAttr[];
  getAttribute: (name: string) => string | undefined;
};

function createMockElement(
  props: string | undefined,
  shorthands: Record<string, string> = {},
): Element {
  const attributes: MockAttr[] = [];
  if (props !== undefined) {
    attributes.push({ name: "data-cyanly-props", value: props });
  }
  for (const [key, val] of Object.entries(shorthands)) {
    attributes.push({ name: `data-cyanly-prop-${key}`, value: val });
  }

  const mock: MockElement = {
    attributes,
    getAttribute: (name: string): string | undefined => {
      const found = attributes.find((attr) => attr.name === name);
      return found?.value;
    },
  };

  return mock as unknown as Element;
}

describe("readDeclarativeProps", () => {
  const warnSpy = vi.spyOn(console, "warn");

  beforeEach(() => {
    warnSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("should return ok: true and undefined properties when no attributes are present", () => {
    const el = createMockElement(undefined);
    const result = readDeclarativeProps(el);
    expect(result).toEqual({ ok: true, properties: undefined });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should parse valid JSON object from data-cyanly-props", () => {
    const jsonStr = JSON.stringify({
      product_id: "xyz",
      price: 99.9,
      active: true,
    });
    const el = createMockElement(jsonStr);
    const result = readDeclarativeProps(el);
    expect(result).toEqual({
      ok: true,
      properties: {
        product_id: "xyz",
        price: 99.9,
        active: true,
      },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should return ok: false and warn if data-cyanly-props is invalid JSON", () => {
    const el = createMockElement("{invalid-json}");
    const result = readDeclarativeProps(el);
    expect(result).toEqual({ ok: false });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("Invalid JSON");
  });

  it("should return ok: false and warn if data-cyanly-props parses to a non-object", () => {
    // Array
    const elArr = createMockElement("[1, 2, 3]");
    const resultArr = readDeclarativeProps(elArr);
    expect(resultArr).toEqual({ ok: false });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("must be a JSON object");

    warnSpy.mockClear();

    // String/Number
    const elNum = createMockElement("123");
    const resultNum = readDeclarativeProps(elNum);
    expect(resultNum).toEqual({ ok: false });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("must be a JSON object");
  });

  it("should parse shorthand data-cyanly-prop-<name> attributes", () => {
    const el = createMockElement(undefined, {
      "product-id": "xyz",
      price: "100",
    });
    const result = readDeclarativeProps(el);
    expect(result).toEqual({
      ok: true,
      properties: {
        product_id: "xyz",
        price: "100",
      },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should ignore malformed or empty shorthand property keys", () => {
    // Empty key after data-cyanly-prop-
    const attributes = [{ name: "data-cyanly-prop-", value: "test" }];
    const el = {
      attributes,
      getAttribute: () => undefined,
    } as unknown as Element;

    const result = readDeclarativeProps(el);
    expect(result).toEqual({ ok: true, properties: undefined });
  });

  describe("shorthand type coercion", () => {
    it("should coerce to number correctly", () => {
      const el = createMockElement(undefined, {
        price: "899::<number>",
        float: "12.34::<number>",
      });
      const result = readDeclarativeProps(el);
      expect(result).toEqual({
        ok: true,
        properties: {
          price: 899,
          float: 12.34,
        },
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should fall back to string and warn if number coercion parses to NaN", () => {
      const el = createMockElement(undefined, {
        price: "invalid_num::<number>",
      });
      const result = readDeclarativeProps(el);
      expect(result).toEqual({
        ok: true,
        properties: {
          price: "invalid_num",
        },
      });
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain("cannot parse \"invalid_num\" as number");
    });

    it("should coerce to boolean correctly", () => {
      const cases = [
        { raw: "true::<boolean>", expected: true },
        { raw: "TRUE::<boolean>", expected: true },
        { raw: "yes::<boolean>", expected: true },
        { raw: "1::<boolean>", expected: true },
        { raw: "false::<boolean>", expected: false },
        { raw: "FALSE::<boolean>", expected: false },
        { raw: "0::<boolean>", expected: false },
        { raw: "::<boolean>", expected: false },
        { raw: "  false  ::<boolean>", expected: false },
      ];

      for (const { raw, expected } of cases) {
        const el = createMockElement(undefined, { flag: raw });
        const result = readDeclarativeProps(el);
        expect(result).toEqual({
          ok: true,
          properties: { flag: expected },
        });
      }
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should coerce to string correctly by removing suffix", () => {
      const el = createMockElement(undefined, {
        name: "foo::<string>",
        special: "123::<string>",
      });
      const result = readDeclarativeProps(el);
      expect(result).toEqual({
        ok: true,
        properties: {
          name: "foo",
          special: "123",
        },
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("merge and override rules", () => {
    it("should merge JSON props and shorthand props with shorthand overriding JSON", () => {
      const baseJson = JSON.stringify({
        a: 1,
        b: "original",
        c: true,
      });
      const el = createMockElement(baseJson, {
        b: "overridden",
        d: "new-value",
      });

      const result = readDeclarativeProps(el);
      expect(result).toEqual({
        ok: true,
        properties: {
          a: 1,
          b: "overridden",
          c: true,
          d: "new-value",
        },
      });
    });
  });
});
