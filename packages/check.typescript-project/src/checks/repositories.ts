import { defineChecker } from "@silvermoon-work/check-task-sdk";
import { Input } from "../contract.js";
import { workspace } from "./workspace.js";

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
    check: (target, signal) => {
      signal.throwIfAborted();
      return Promise.resolve({
        pass: true,
        children: [{ checker: "workspace", target }],
      } as const);
    },
  }),
  workspace,
};
