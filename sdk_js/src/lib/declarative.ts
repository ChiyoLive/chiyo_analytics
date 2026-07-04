import type { EventProperties } from "../types";

/**
 * 声明式埋点的 properties 解析。
 *
 * 支持两种写法，可同时使用：
 *   1. data-cyanly-props='{"product_id":"x","price":899}'
 *      —— 完整 JSON 对象字符串，值可为 string/number/boolean。
 *   2. data-cyanly-prop-<name>="value"
 *      —— 单属性简写，属性名连字符自动转 snake_case
 *      （data-cyanly-prop-product-id → product_id）。
 *      值默认是字符串，但支持 `value::<type>` 魔法字符串显式指定类型：
 *        - "899::<number>"    → 899 (number)，经 Number()
 *        - "false::<boolean>" → false（"false"/"0"/"" 为 false，其余为 true）
 *        - "true::<boolean>"  → true
 *        - "x::<string>"      → "x" (string，去掉后缀)
 *      无后缀则保持原始字符串。
 *
 * 合并规则：以 data-cyanly-props 为基准，data-cyanly-prop-<name> 覆盖同名键。
 *
 * 非法 JSON（data-cyanly-props 填了但解析失败）返回 ok=false，调用方据此
 * 丢弃整个事件，而不是降级成无 properties 发送。
 */

const PROP_PREFIX = "data-cyanly-prop-";

// 匹配 `<value>::<number|string|boolean>` 后缀。s 标志让 value 可含换行。
const MAGIC_TYPE_RE = /^([\s\S]*)::<(number|string|boolean)>$/;

export type DeclarativeProps =
  | { ok: true; properties: EventProperties | undefined }
  | { ok: false };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * 解析简写值的 `::<type>` 魔法字符串后缀。无后缀（或后缀非法）时原样返回字符串。
 * `::<number>` 解析为 NaN 时降级为字符串并告警，避免 JSON.stringify(NaN) → null
 * 造成的静默损坏。
 */
function coerceShorthandValue(raw: string): string | number | boolean {
  const m = MAGIC_TYPE_RE.exec(raw);
  if (!m) return raw;

  const value = m[1];
  const type = m[2];

  if (type === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) {
      console.warn(
        `[cyanly] cannot parse "${value}" as number; kept as string`,
      );
      return value;
    }
    return n;
  }
  if (type === "boolean") {
    // Explicit, intuitive mapping rather than JS truthiness: "false"
    // (case-insensitive), "0" and "" are false; everything else is true.
    const normalized = value.trim().toLowerCase();
    return !(normalized === "false" || normalized === "0" || normalized === "");
  }
  // type === "string": strip the suffix, keep the value verbatim.
  return value;
}

export function readDeclarativeProps(el: Element): DeclarativeProps {
  let base: EventProperties | undefined;

  const propsAttr = el.getAttribute("data-cyanly-props");
  if (propsAttr) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(propsAttr);
    } catch {
      console.warn(
        "[cyanly] Invalid JSON in data-cyanly-props; event dropped:",
        propsAttr,
      );
      return { ok: false };
    }
    if (!isPlainObject(parsed)) {
      console.warn(
        "[cyanly] data-cyanly-props must be a JSON object; event dropped:",
        propsAttr,
      );
      return { ok: false };
    }
    base = parsed as EventProperties;
  }

  // Collect data-cyanly-prop-<name> attributes. HTML lowercases attribute
  // names; values default to strings but support `::<type>` coercion.
  let individual: EventProperties | undefined;
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith(PROP_PREFIX)) continue;
    const key = attr.name.slice(PROP_PREFIX.length).replace(/-/g, "_");
    if (!key) continue;
    if (!individual) individual = {};
    individual[key] = coerceShorthandValue(attr.value);
  }

  if (base === undefined && individual === undefined) {
    return { ok: true, properties: undefined };
  }

  // data-cyanly-prop-<name> overrides same keys in data-cyanly-props.
  return { ok: true, properties: { ...base, ...individual } };
}
