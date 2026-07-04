import type { EventProperties } from "../types";

/**
 * Custom event properties 的运行时校验。
 *
 * 不引入 zod 等额外依赖，手写以保持 SDK 体积。校验目标：
 *   1. 运行时类型与 EventProperties 声明一致（plain object，值为 string/number/boolean）；
 *   2. 序列化后不超过后端 4KB 限制，避免 sendBeacon 静默丢失。
 */

// 与后端 collector 的 4096 字节限制保持一致。
export const MAX_PROPERTIES_BYTES = 4096;

export type ValidatedProperties = {
  ok: boolean;
  /** 校验通过且非空时为序列化后的 JSON 字符串，否则为 "" */
  serialized: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== undefined &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * 校验并序列化 properties。任何问题都会 console.warn 并返回 ok=false，
 * 让调用方提前 return，而不是把坏数据交给 sendBeacon。
 */
export function validateProperties(
  properties: EventProperties | undefined,
): ValidatedProperties {
  if (properties === undefined) {
    return { ok: true, serialized: "" };
  }

  if (!isPlainObject(properties)) {
    console.warn("[cyanly] properties must be a plain object:", properties);
    return { ok: false, serialized: "" };
  }

  for (const key of Object.keys(properties)) {
    const v = properties[key];
    const t = typeof v;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      console.warn(
        `[cyanly] properties.${key} must be string | number | boolean, got ${t}`,
      );
      return { ok: false, serialized: "" };
    }
  }

  const serialized = JSON.stringify(properties);

  // 以 UTF-8 字节长度衡量，与后端 len([]byte) 口径一致。
  const byteLength =
    typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(serialized).length
      : serialized.length;
  if (byteLength > MAX_PROPERTIES_BYTES) {
    console.warn(
      `[cyanly] properties exceeds ${MAX_PROPERTIES_BYTES} bytes (${byteLength}); event dropped`,
    );
    return { ok: false, serialized: "" };
  }

  return { ok: true, serialized };
}
