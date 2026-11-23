import { Value } from "@sinclair/typebox/value";
import {
  acceptPayload,
  compileJsonSchema,
} from "@silvermoon-work/task-protocol";
import type { TObject, TSchema } from "@sinclair/typebox";
import { canonicalSnapshot, jsonObject, type JsonObject } from "./canonical.js";
import { defineChecker, type CheckerResult, type Problem } from "./checker.js";
import { problemCodes, type CheckContract } from "./legacy-contracts.js";
import { exactCid, validateCheckReport } from "./legacy-report.js";

/** The owner must cancel accepted work and await its real release before settling. */
export interface CheckExecutionPort {
  execute(request: {
    readonly bundleCid: string;
    readonly input: JsonObject;
    readonly signal: AbortSignal;
  }): Promise<{ readonly result: unknown }>;
}

export function checkerFromBundle<
  const Input extends TObject,
  Code extends TSchema,
>(options: {
  readonly bundleCid: string;
  readonly contract: CheckContract<Input, Code>;
  readonly port: CheckExecutionPort;
}) {
  const bundleCid = exactCid(options.bundleCid);
  const port: unknown = options.port;
  if (
    !port ||
    typeof port !== "object" ||
    !("execute" in port) ||
    typeof port.execute !== "function"
  )
    throw new Error(
      "Bundle Checker requires a caller-owned execution port, not invokeTask.",
    );
  const execute = options.port.execute.bind(options.port);
  const codes = new Set(
    problemCodes(options.contract.schemas["check-problem-code"]),
  );
  const resultSchema = compileJsonSchema(
    JSON.parse(JSON.stringify(options.contract.result)) as unknown,
  ).schema;
  return defineChecker({
    target: options.contract.parameters,
    check: async (target, signal): Promise<CheckerResult<never>> => {
      const input = canonicalSnapshot(target).value;
      if (
        !jsonObject(input) ||
        !Value.Check(options.contract.parameters, input)
      )
        throw new Error("Invalid Bundle Checker input.");
      signal.throwIfAborted();
      const raw: unknown = await execute({ bundleCid, input, signal });
      signal.throwIfAborted();
      const output = canonicalSnapshot(raw, {
        bytes: 66_560,
        depth: 73,
        values: 262_144,
      }).value;
      if (
        !jsonObject(output) ||
        !Object.hasOwn(output, "result") ||
        Object.keys(output).length !== 1
      )
        throw new Error(
          "Bundle Checker requires an authentic output envelope.",
        );
      const payload = acceptPayload(output.result, resultSchema);
      const report = validateCheckReport(payload.data, 65_536, true);
      if (report.pass) return { pass: true, children: [] };
      const problems = report.problems.map((problem): Problem => {
        if (problem.source.kind === "local" && !codes.has(problem.code))
          throw new Error(
            "Child Check report contains an undeclared local problem code.",
          );
        return {
          code: problem.code,
          brief: problem.brief,
          documentation: problem.documentation,
          source:
            problem.source.kind === "bundle"
              ? problem.source
              : {
                  kind: "bundle",
                  bundleCid,
                  checker: problem.source.checker,
                  nodeKey: problem.source.nodeKey,
                },
        };
      });
      const [first, ...rest] = problems;
      if (!first) throw new Error("Failed Bundle Checker requires problems.");
      return { pass: false, problems: [first, ...rest] };
    },
  });
}
