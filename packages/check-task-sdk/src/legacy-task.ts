import { runTask, type TaskCallback } from "@silvermoon-work/task-sdk";
import type { Static, TObject, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  ContentRef,
  compileJsonSchema,
  encodeChannel,
} from "@silvermoon-work/task-protocol";
import { canonicalSnapshot } from "./canonical.js";
import { problemCodes, type CheckContract } from "./legacy-contracts.js";
import type { CheckedRegistry, CheckerRegistry } from "./checker.js";
import { executeCheckInput, type CheckLimits } from "./graph.js";
import type { ReportProblem } from "./legacy-report.js";
import type { CheckContext, CheckOutputOptions } from "./legacy.js";

type Factory<Input> = (
  context: CheckContext,
  input: Input,
) => CheckerRegistry | Promise<CheckerRegistry>;
export type CheckTaskResult =
  | {
      readonly pass: true;
      readonly documentation: ContentRef;
      readonly assets?: ContentRef;
    }
  | {
      readonly pass: false;
      readonly documentation: ContentRef;
      readonly assets?: ContentRef;
      readonly problems: readonly (Omit<ReportProblem, "documentation"> & {
        readonly documentation: ContentRef;
      })[];
    };
type Related<Input, R extends CheckerRegistry, K extends keyof R> = [
  R,
] extends [CheckedRegistry<R>]
  ? Input extends Static<R[K]["target"]>
    ? unknown
    : never
  : never;
type RegistryOptions<
  Input,
  R extends CheckerRegistry,
  K extends keyof R & string,
> = {
  readonly registry: R;
  readonly root: K;
  readonly limits?: Partial<CheckLimits>;
} & Related<Input, NoInfer<R>, NoInfer<K>>;
type FactoryOptions<
  Input,
  F extends Factory<Input>,
  K extends keyof Awaited<ReturnType<F>> & string,
> = {
  readonly registry: F;
  readonly root: K;
  readonly limits?: Partial<CheckLimits>;
} & Related<Input, NoInfer<Awaited<ReturnType<F>>>, NoInfer<K>>;
interface Binding<Input> {
  readonly registry: CheckerRegistry | Factory<Input>;
  readonly root: string;
  readonly limits?: Partial<CheckLimits>;
}

function bind<Input extends TObject, Code extends TSchema>(
  contract: CheckContract<Input, Code>,
  options: Binding<Static<Input>>,
  output: CheckOutputOptions,
): TaskCallback<Static<Input>, CheckTaskResult> {
  const supplied: unknown = options.registry;
  if (
    typeof options.root !== "string" ||
    !supplied ||
    !["object", "function"].includes(typeof supplied)
  )
    throw new Error("Check requires a registry and explicit root name.");
  const assets = output.assets ?? false;
  if (typeof assets !== "boolean")
    throw new Error("Check output assets option must be a boolean.");
  const codes = problemCodes(contract.schemas["check-problem-code"]);
  const resultSchema = compileJsonSchema(
    JSON.parse(JSON.stringify(contract.result)) as unknown,
  ).schema;
  return async (input, context) => {
    context.signal.throwIfAborted();
    const snapshot = canonicalSnapshot(input).value;
    if (!Value.Check(contract.parameters, snapshot))
      throw new Error("Invalid Check Task input.");
    const registry = options.registry;
    const report = await executeCheckInput({
      registry: async (signal) => {
        const restricted = Object.freeze<CheckContext>({
          signal,
          log: (value) => context.log(value),
          progress: (value) => context.progress(value),
          bundle: context.bundle,
          readContent: (cid, options) => context.readContent(cid, options),
          resolveContent: (cid, path, options) =>
            context.resolveContent(cid, path, options),
          putContent: (content, options) =>
            context.putContent(content, options),
          invokeTask: (request) => context.invokeTask(request),
        });
        return typeof registry === "function"
          ? registry(restricted, snapshot)
          : registry;
      },
      root: { checker: options.root, target: snapshot },
      signal: context.signal,
      problemCodes: codes,
      log: async (node) => {
        await context.log({
          level: "info",
          message: JSON.stringify(node),
        });
      },
      ...(options.limits ? { limits: options.limits } : {}),
    });
    context.signal.throwIfAborted();
    const reference = async (path: string, file: boolean) => {
      const cid = await context.resolveContent(context.bundle, path, {
        signal: context.signal,
      });
      const node = await context.readContent(cid, { signal: context.signal });
      if (file && node.kind !== "file")
        throw new Error(`Check documentation is not a file: ${path}`);
      if (!file && node.kind !== "directory")
        throw new Error(`Check assets are not a directory: ${path}`);
      return ContentRef.fromCID(cid);
    };
    const documentation = await reference(
      `resources/${report.documentation}`,
      true,
    );
    const resources = assets
      ? { assets: await reference("resources/assets", false) }
      : {};
    const result: CheckTaskResult = report.pass
      ? { pass: true, documentation, ...resources }
      : {
          pass: false,
          documentation,
          ...resources,
          problems: await Promise.all(
            report.problems.map(async (problem) => ({
              ...problem,
              documentation:
                problem.source.kind === "local"
                  ? await reference(`resources/${problem.documentation}`, true)
                  : ContentRef.fromCID(problem.documentation),
            })),
          ),
        };
    context.signal.throwIfAborted();
    encodeChannel(resultSchema, result);
    return result;
  };
}

export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
  const F extends Factory<Static<Input>>,
  K extends keyof Awaited<ReturnType<F>> & string,
>(
  contract: CheckContract<Input, Code>,
  options: FactoryOptions<Static<Input>, F, K>,
  output?: CheckOutputOptions,
): TaskCallback<Static<Input>, CheckTaskResult>;
export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
  const R extends CheckerRegistry,
  K extends keyof R & string,
>(
  contract: CheckContract<Input, Code>,
  options: RegistryOptions<Static<Input>, R, K>,
  output?: CheckOutputOptions,
): TaskCallback<Static<Input>, CheckTaskResult>;
export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
>(
  contract: CheckContract<Input, Code>,
  options: Binding<Static<Input>>,
  output: CheckOutputOptions = {},
): TaskCallback<Static<Input>, CheckTaskResult> {
  return bind(contract, options, output);
}

export function runCheck<
  Input extends TObject,
  Code extends TSchema,
  const F extends Factory<Static<Input>>,
  K extends keyof Awaited<ReturnType<F>> & string,
>(
  contract: CheckContract<Input, Code>,
  options: FactoryOptions<Static<Input>, F, K>,
  output?: CheckOutputOptions,
): void;
export function runCheck<
  Input extends TObject,
  Code extends TSchema,
  const R extends CheckerRegistry,
  K extends keyof R & string,
>(
  contract: CheckContract<Input, Code>,
  options: RegistryOptions<Static<Input>, R, K>,
  output?: CheckOutputOptions,
): void;
export function runCheck<Input extends TObject, Code extends TSchema>(
  contract: CheckContract<Input, Code>,
  options: Binding<Static<Input>>,
  output: CheckOutputOptions = {},
): void {
  runTask(bind(contract, options, output));
}
