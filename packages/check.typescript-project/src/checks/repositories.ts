import { defineChecker } from "@silvermoon-work/check-task-sdk";
import { Input } from "../contract.js";

export const repositories = {
  "single-repo": defineChecker({
    target: Input,
    check: (_target, signal) => {
      signal.throwIfAborted();
      return Promise.resolve({ pass: true, children: [] } as const);
    },
  }),
  monorepo: defineChecker({
    target: Input,
    check: (_target, signal) => {
      signal.throwIfAborted();
      return Promise.resolve({ pass: true, children: [] } as const);
    },
  }),
};
