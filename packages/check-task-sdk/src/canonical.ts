import { types } from "node:util";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export interface EncodingLimits {
  readonly bytes: number;
  readonly depth: number;
  readonly values: number;
}
const defaults: EncodingLimits = { bytes: 65_536, depth: 64, values: 16_384 };

export function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Inspect descriptors rather than executing getters, toJSON or Proxy traps. */
export function canonicalSnapshot(
  input: unknown,
  limits: EncodingLimits = defaults,
): {
  readonly value: JsonValue;
  readonly encoded: string;
  readonly bytes: number;
} {
  let bytes = 0;
  let values = 0;
  const ancestors = new Set<object>();
  const chunks: string[] = [];
  const append = (text: string) => {
    bytes += Buffer.byteLength(text);
    if (bytes > limits.bytes)
      throw new Error("Check encoding byte budget exceeded.");
    chunks.push(text);
  };
  const quote = (text: string) => {
    if (text.length > limits.bytes - bytes)
      throw new Error("Check encoding byte budget exceeded.");
    append(JSON.stringify(text));
  };
  const visit = (value: unknown, depth: number): JsonValue => {
    if (++values > limits.values || depth > limits.depth)
      throw new Error("Check encoding structure budget exceeded.");
    if (value === null) {
      append("null");
      return null;
    }
    if (typeof value === "boolean") {
      append(String(value));
      return value;
    }
    if (typeof value === "string") {
      quote(value);
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const normalized = Object.is(value, -0) ? 0 : value;
      append(JSON.stringify(normalized));
      return normalized;
    }
    if (typeof value !== "object" || types.isProxy(value))
      throw new Error("Unsupported Check JSON value.");
    if (ancestors.has(value)) throw new Error("Cyclic Check JSON value.");
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw new Error("Unsupported Check JSON prototype.");
    const keys = Reflect.ownKeys(value);
    if (keys.length > limits.values - values + (array ? 1 : 0))
      throw new Error("Check encoding structure budget exceeded.");
    const properties = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string")
        throw new Error("Unsupported Check JSON symbol key.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (
        !("value" in descriptor) ||
        (!descriptor.enumerable && !(array && key === "length"))
      )
        throw new Error("Unsupported Check JSON property descriptor.");
      properties.set(key, descriptor.value);
    }
    ancestors.add(value);
    if (array) {
      const length = properties.get("length");
      if (typeof length !== "number" || properties.size !== length + 1)
        throw new Error("Sparse or extended Check JSON array.");
      const output: JsonValue[] = [];
      append("[");
      for (let index = 0; index < length; index++) {
        if (!properties.has(String(index)))
          throw new Error("Sparse Check JSON array.");
        if (index) append(",");
        output.push(visit(properties.get(String(index)), depth + 1));
      }
      append("]");
      ancestors.delete(value);
      Object.freeze(output);
      return output;
    }
    const output: Record<string, JsonValue> = {};
    append("{");
    let first = true;
    for (const key of [...properties.keys()].sort(compare)) {
      if (!first) append(",");
      first = false;
      quote(key);
      append(":");
      Object.defineProperty(output, key, {
        value: visit(properties.get(key), depth + 1),
        enumerable: true,
      });
    }
    append("}");
    ancestors.delete(value);
    return Object.freeze(output);
  };
  const value = visit(input, 0);
  return Object.freeze({ value, encoded: chunks.join(""), bytes });
}

export function jsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function fields(
  value: JsonObject,
  expected: readonly string[],
): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
