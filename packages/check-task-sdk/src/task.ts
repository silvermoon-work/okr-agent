import { runTask, type TaskCallback } from "@silvermoon-work/task-sdk";
import type { Static, TObject, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  ContentRef,
  compileJsonSchema,
  encodeChannel,
} from "@silvermoon-work/task-protocol";
import {
  contractCheckpointIds,
  ruleCodes,
  type CheckContract,
} from "./contracts.js";
import {
  isCheckpointDefinition,
  type CheckpointDefinition,
} from "./checkpoint.js";
import { executeCheck } from "./pipeline.js";
import type { ReportProblem } from "./report.js";
import type { CheckContext, CheckOutputOptions } from "./legacy.js";

export type CheckTaskResult = {
  readonly documentation: ContentRef;
  readonly references: readonly {
    readonly checkpoint: string;
    readonly documentation: ContentRef;
  }[];
  readonly assets?: ContentRef;
} & (
  | { readonly pass: true }
  | { readonly pass: false; readonly problems: readonly ReportProblem[] }
);
export interface CheckTaskOptions<Input> {
  readonly checkpoints:
    | readonly CheckpointDefinition[]
    | ((
        context: CheckContext,
        input: Input,
      ) =>
        | readonly CheckpointDefinition[]
        | Promise<readonly CheckpointDefinition[]>);
}

export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
>(
  contract: CheckContract<Input, Code>,
  options: CheckTaskOptions<Static<Input>>,
  output: CheckOutputOptions = {},
): TaskCallback<Static<Input>, CheckTaskResult> {
  const assets = output.assets ?? false;
  if (typeof assets !== "boolean")
    throw new Error("Check output assets option must be a boolean.");
  const codes = ruleCodes(contract.schemas["check-rule-code"]);
  const ids = contractCheckpointIds(contract.schemas["check-checkpoint-id"]);
  const resultSchema = compileJsonSchema(
    JSON.parse(JSON.stringify(contract.result)) as unknown,
  ).schema;
  return async (input, context) => {
    context.signal.throwIfAborted();
    if (!Value.Check(contract.parameters, input))
      throw new Error("Invalid Check Task input.");
    const restricted = Object.freeze<CheckContext>({
      signal: context.signal,
      log: (value) => context.log(value),
      progress: (value) => context.progress(value),
      bundle: context.bundle,
      readContent: (cid, options) => context.readContent(cid, options),
      resolveContent: (cid, path, options) =>
        context.resolveContent(cid, path, options),
      putContent: (content, options) => context.putContent(content, options),
      invokeTask: (request) => context.invokeTask(request),
    });
    const checkpoints =
      typeof options.checkpoints === "function"
        ? await options.checkpoints(restricted, input)
        : options.checkpoints;
    context.signal.throwIfAborted();
    if (
      !Array.isArray(checkpoints) ||
      checkpoints.some(
        (checkpoint: unknown) =>
          !isCheckpointDefinition(checkpoint) ||
          !ids.includes(checkpoint.id) ||
          checkpoint.rules.some((rule) => !codes.includes(rule.code)),
      )
    )
      throw new Error("Undeclared checkpoint ID or rule code.");
    const report = await executeCheck({
      checkpoints,
      target: input,
      signal: context.signal,
      log: async (step) => {
        await context.log({ level: "info", message: JSON.stringify(step) });
      },
    });
    const reference = async (path: string, file: boolean) => {
      context.signal.throwIfAborted();
      const cid = await context.resolveContent(context.bundle, path, {
        signal: context.signal,
      });
      context.signal.throwIfAborted();
      const node = await context.readContent(cid, { signal: context.signal });
      context.signal.throwIfAborted();
      if (node.kind !== (file ? "file" : "directory"))
        throw new Error(
          `Check ${file ? "documentation is not a file" : "assets are not a directory"}: ${path}`,
        );
      return ContentRef.fromCID(cid);
    };
    const documentation = await reference(
      `resources/${report.documentation}`,
      true,
    );
    const references = [];
    for (const item of report.references)
      references.push({
        checkpoint: item.checkpoint,
        documentation: await reference(`resources/${item.documentation}`, true),
      });
    const resources = assets
      ? { assets: await reference("resources/assets", false) }
      : {};
    const result: CheckTaskResult = report.pass
      ? { pass: true, documentation, references, ...resources }
      : {
          pass: false,
          documentation,
          references,
          problems: report.problems,
          ...resources,
        };
    context.signal.throwIfAborted();
    encodeChannel(resultSchema, result);
    return result;
  };
}

export function runCheck<Input extends TObject, Code extends TSchema>(
  contract: CheckContract<Input, Code>,
  options: CheckTaskOptions<Static<Input>>,
  output: CheckOutputOptions = {},
): void {
  runTask(createCheckCallback(contract, options, output));
}
