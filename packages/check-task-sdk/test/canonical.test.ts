import { expect, it } from "vitest";
import { canonicalSnapshot } from "../src/canonical.js";

it("distinguishes array order, names and unnormalized Unicode while accepting shared values", () => {
  const shared = {
    value: null,
    yes: true,
    no: false,
    n: 1.25,
    quote: '"\\',
    surrogate: "\ud800",
  };
  const value = { z: shared, a: shared };
  expect(canonicalSnapshot(value).encoded).toBe(
    canonicalSnapshot({ a: { ...shared }, z: { ...shared } }).encoded,
  );
  expect(canonicalSnapshot(["a", { x: [1, 2] }]).encoded).not.toBe(
    canonicalSnapshot(["b", { x: [1, 2] }]).encoded,
  );
  expect(canonicalSnapshot({ x: [1, 2] }).encoded).not.toBe(
    canonicalSnapshot({ x: [2, 1] }).encoded,
  );
  expect(canonicalSnapshot({ x: "\u00e9" }).encoded).not.toBe(
    canonicalSnapshot({ x: "e\u0301" }).encoded,
  );
  const nullPrototype: object = Object.create(null) as object;
  Object.defineProperty(nullPrototype, "__proto__", {
    value: "data",
    enumerable: true,
  });
  expect(canonicalSnapshot(nullPrototype).encoded).toBe('{"__proto__":"data"}');
  expect(canonicalSnapshot(canonicalSnapshot(value).value).encoded).toBe(
    canonicalSnapshot(value).encoded,
  );
});
it.each([
  1n,
  Symbol("x"),
  () => 1,
  NaN,
  -Infinity,
  new Set(),
  new Uint8Array(),
  { [Symbol("x")]: 1 },
  Object.assign([1], { extra: true }),
  Object.defineProperty([1], "0", { get: () => 1 }),
  Object.assign([1, 2], { "01": 3 }),
])("rejects unsupported finite JSON representations %#", (value) => {
  expect(() => canonicalSnapshot(value)).toThrow();
});
it("rejects cycles and enforces depth, property, value and byte limits during encoding", () => {
  const cyclic: { self?: object } = {};
  cyclic.self = cyclic;
  expect(() => canonicalSnapshot(cyclic)).toThrow("Cyclic");
  expect(() =>
    canonicalSnapshot({ a: { b: {} } }, { bytes: 100, depth: 1, values: 100 }),
  ).toThrow("structure");
  expect(() =>
    canonicalSnapshot({ a: 1, b: 2 }, { bytes: 100, depth: 10, values: 2 }),
  ).toThrow("structure");
  expect(() =>
    canonicalSnapshot([1, 2, 3], { bytes: 100, depth: 10, values: 3 }),
  ).toThrow("structure");
  expect(() =>
    canonicalSnapshot("x".repeat(10), { bytes: 10, depth: 10, values: 100 }),
  ).toThrow("byte");
  expect(() =>
    canonicalSnapshot("é".repeat(3), { bytes: 7, depth: 10, values: 100 }),
  ).toThrow("byte");
  expect(() =>
    canonicalSnapshot("long", { bytes: 1, depth: 10, values: 100 }),
  ).toThrow("byte");
  expect(
    canonicalSnapshot({ a: 1 }, { bytes: 7, depth: 1, values: 2 }).bytes,
  ).toBe(7);
});
