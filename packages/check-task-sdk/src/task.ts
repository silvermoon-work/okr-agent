import { runTask, type TaskCallback } from "@silvermoon-work/task-sdk";
import type { Static, TObject, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { json } from "@silvermoon-work/task-protocol";
import { canonicalSnapshot } from "./canonical.js";
import { problemCodes, type CheckContract } from "./contracts.js";
import type { CheckedRegistry, CheckerRegistry } from "./checker.js";
import { executeCheckInput, type CheckLimits } from "./graph.js";
import type { CheckReport } from "./report.js";
import type { CheckContext, CheckOutputOptions } from "./index.js";

type Factory<Input> = (
  context: CheckContext,
  input: Input,
) => CheckerRegistry | Promise<CheckerRegistry>;
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
): TaskCallback<Static<Input>, CheckReport> {
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
  return async (input, context) => {
    context.signal.throwIfAborted();
    const snapshot = canonicalSnapshot(input).value;
    if (!Value.Check(contract.input, snapshot))
      throw new Error("Invalid Check Task input.");
    const registry = options.registry;
    const report = await executeCheckInput({
      registry: async (signal) => {
        const restricted = Object.freeze<CheckContext>({
          signal,
          log: (value) => context.log(value),
          progress: (value) => context.progress(value),
          bundle: context.bundle,
          space: (cid) => context.space(cid),
          invokeTask: (request) => context.invokeTask(request),
        });
        return typeof registry === "function"
          ? registry(restricted, snapshot)
          : registry;
      },
      root: { checker: options.root, target: snapshot },
      signal: context.signal,
      problemCodes: codes,
      ...(options.limits ? { limits: options.limits } : {}),
    });
    context.signal.throwIfAborted();
    // Public Task Protocol 0.2.0-rc.1 admits at most 64 KiB of result JSON.
    canonicalSnapshot(report, { bytes: 65_536, depth: 72, values: 262_144 });
    json(report, 65_536);
    await context.output.link(
      "references",
      context.bundle.root.resolve("resources/references"),
    );
    if (assets) {
      context.signal.throwIfAborted();
      await context.output.link(
        "assets",
        context.bundle.root.resolve("resources/assets"),
      );
    }
    context.signal.throwIfAborted();
    return report;
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
): TaskCallback<Static<Input>, CheckReport>;
export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
  const R extends CheckerRegistry,
  K extends keyof R & string,
>(
  contract: CheckContract<Input, Code>,
  options: RegistryOptions<Static<Input>, R, K>,
  output?: CheckOutputOptions,
): TaskCallback<Static<Input>, CheckReport>;
export function createCheckCallback<
  Input extends TObject,
  Code extends TSchema,
>(
  contract: CheckContract<Input, Code>,
  options: Binding<Static<Input>>,
  output: CheckOutputOptions = {},
): TaskCallback<Static<Input>, CheckReport> {
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
