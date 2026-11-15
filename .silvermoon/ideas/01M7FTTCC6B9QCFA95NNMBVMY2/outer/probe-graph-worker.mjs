import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { defineChecker, runCheck } from "@silvermoon-work/check-task-sdk";
import contract, { Input } from "./probe-contract.mjs";

runCheck(contract, {
  registry: {
    probe: defineChecker({
      target: Input,
      check: async (target, signal) => {
        if (target.mode === "wait") {
          await writeFile(`${target.marker}.started`, "checker-started\n");
          try {
            await delay(20000, undefined, { signal });
          } finally {
            await writeFile(`${target.marker}.cleaned`, "checker-cleaned\n");
          }
        }
        return target.mode === "fail"
          ? { pass: false, problems: [{ code: "child-only", brief: "独立子检查问题。" }] }
          : { pass: true, children: [] };
      },
    }),
  },
  root: "probe",
});
