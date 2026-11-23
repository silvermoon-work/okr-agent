import { expectTypeOf, it } from "vitest";
import { Type } from "@sinclair/typebox";
import { defineChecker, executeCheck, type CheckItem } from "../src/legacy.js";
import { createCheckCallback } from "../src/legacy-task.js";
import { createCheckContract } from "../src/legacy-contracts.js";

it("retains heterogeneous schemas and rejects incorrect roots and children", () => {
  const Text = Type.Object({ text: Type.String() });
  const Number = Type.Object({ count: Type.Number() });
  const registry = {
    text: defineChecker({
      target: Text,
      check: async (target) => {
        expectTypeOf(target.text).toEqualTypeOf<string>();
        await Promise.resolve();
        return {
          pass: true,
          children: [
            { checker: "number", target: { count: target.text.length } },
          ],
        } as const;
      },
    }),
    number: defineChecker({
      target: Number,
      check: async () => {
        await Promise.resolve();
        return { pass: true, children: [] } as const;
      },
    }),
  };
  const invalid = {
    text: defineChecker({
      target: Text,
      check: async () => {
        await Promise.resolve();
        return {
          pass: true,
          children: [{ checker: "number", target: { text: "wrong" } }],
        } as const;
      },
    }),
    number: registry.number,
  };
  const compileOnly = () => {
    const signal = new AbortController().signal;
    void executeCheck({
      registry,
      root: { checker: "text", target: { text: "yes" } },
      signal,
    });
    void executeCheck({
      registry,
      // @ts-expect-error root name is not registered
      root: { checker: "unknown", target: { text: "no" } },
      signal,
    });
    void executeCheck({
      registry,
      // @ts-expect-error target is correlated to the selected root
      root: { checker: "number", target: { text: "no" } },
      signal,
    });
    void executeCheck({
      // @ts-expect-error child target is correlated to its name
      registry: invalid,
      root: { checker: "text", target: { text: "no" } },
      signal,
    });
    const contract = createCheckContract(Text, Type.Literal("missing"));
    createCheckCallback(contract, { registry, root: "text" });
    // @ts-expect-error contract input cannot be a number target
    createCheckCallback(contract, { registry, root: "number" });
    const child: CheckItem<typeof registry> = {
      checker: "number",
      target: { count: 1 },
    };
    void child;
  };
  expectTypeOf(compileOnly).returns.toEqualTypeOf<void>();
});
