import { createHash, randomBytes } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { CID } from "multiformats/cid";
import { parseDocument } from "yaml";

export const gates = [
  "requirements",
  "research",
  "technical",
  "cases",
  "tests",
] as const;
export type Gate = (typeof gates)[number];
export type Revisions = Record<Gate, string>;
export type Files = ReadonlyMap<string, Uint8Array>;
export const maxBytes = 16 * 1024 * 1024;
const closed = { additionalProperties: false };
const nonempty = Type.String({ minLength: 1, pattern: "\\S" });
const digestSchema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const gateSchema = Type.Union(gates.map((gate) => Type.Literal(gate)));
const phaseSchema = Type.Union([
  Type.Literal("implementation"),
  Type.Literal("deployment"),
]);
const vectorSchema = Type.Object(
  {
    requirements: digestSchema,
    research: digestSchema,
    technical: digestSchema,
    cases: digestSchema,
    tests: digestSchema,
  },
  closed,
);
const common = {
  version: Type.Literal(1),
  id: Type.String({ pattern: "^[a-f0-9]{32}$" }),
  at: nonempty,
};
const batchSchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$" }),
    phase: phaseSchema,
    revisions: vectorSchema,
    subject: nonempty,
    environment: nonempty,
    implementation: Type.Optional(digestSchema),
    results: Type.Array(
      Type.Object(
        {
          case: nonempty,
          result: Type.Union([
            Type.Literal("pass"),
            Type.Literal("fail"),
            Type.Literal("error"),
          ]),
          evidence: Type.Array(
            Type.Object({ path: nonempty, digest: digestSchema }, closed),
            { minItems: 1, maxItems: 64 },
          ),
        },
        closed,
      ),
      { minItems: 1, maxItems: 512 },
    ),
  },
  closed,
);
const eventsSchema = Type.Union([
  Type.Object(
    {
      ...common,
      type: Type.Literal("created"),
      idea: nonempty,
      checkCid: nonempty,
      language: Type.Optional(nonempty),
    },
    closed,
  ),
  Type.Object(
    {
      ...common,
      type: Type.Literal("signOff"),
      object: gateSchema,
      revision: digestSchema,
      upstream: Type.Partial(vectorSchema),
      decision: Type.Literal("confirmed"),
    },
    closed,
  ),
  Type.Object(
    {
      ...common,
      type: Type.Literal("setAlias"),
      alias: Type.Union([
        Type.Null(),
        Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
      ]),
    },
    closed,
  ),
  Type.Object(
    {
      ...common,
      type: Type.Literal("setLanguage"),
      language: Type.Union([Type.Null(), nonempty]),
    },
    closed,
  ),
  Type.Object(
    { ...common, type: Type.Literal("abandon"), reason: nonempty },
    closed,
  ),
  Type.Object({ ...common, type: Type.Literal("resume") }, closed),
  Type.Object(
    { ...common, type: Type.Literal("verify"), batch: batchSchema },
    closed,
  ),
]);
export type Event = Static<typeof eventsSchema>;
export type Batch = Static<typeof batchSchema>;
export const BootstrapSchema = Type.Object(
  {
    version: Type.Literal(1),
    id: nonempty,
    checkCid: nonempty,
    createdAt: nonempty,
  },
  closed,
);
export type Bootstrap = Static<typeof BootstrapSchema>;
const caseIndexSchema = Type.Object(
  {
    version: Type.Literal(1),
    cases: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: "^[A-Z][A-Z0-9-]{0,63}$" }),
          phase: phaseSchema,
          environment: nonempty,
          subject: Type.Union([
            Type.Literal("git-head"),
            Type.Literal("implementation"),
          ]),
        },
        closed,
      ),
      { minItems: 1, maxItems: 512 },
    ),
  },
  closed,
);
export type CaseIndex = Static<typeof caseIndexSchema>;
const projectSchema = Type.Object(
  {
    version: Type.Literal(2),
    primaryRepository: nonempty,
    primaryBranch: nonempty,
    preferredLanguage: Type.Optional(nonempty),
  },
  closed,
);
export type ProjectConfig = Static<typeof projectSchema>;
export class SilvermoonError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SilvermoonError";
  }
}
export function invariant(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new SilvermoonError(code, message);
}
export function text(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  invariant(
    value !== undefined &&
      typeof value !== "function" &&
      typeof value !== "symbol",
    "invalid-json",
    "Undefined is not a JSON value.",
  );
  return JSON.stringify(value);
}
export function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function language(value: string): string {
  try {
    const [tag] = Intl.getCanonicalLocales(value);
    invariant(
      tag && tag === value,
      "language",
      "Use a canonical BCP 47 content language.",
    );
    return tag;
  } catch (cause) {
    if (cause instanceof SilvermoonError) throw cause;
    throw new SilvermoonError("language", "Invalid BCP 47 content language.");
  }
}
export function yamlObject(source: string): unknown {
  const doc = parseDocument(source, { uniqueKeys: true });
  invariant(!doc.errors.length, "config", "Invalid YAML configuration.");
  return doc.toJS({ maxAliasCount: 0 }) as unknown;
}
export function projectConfig(source: string): ProjectConfig {
  const value = yamlObject(source);
  invariant(
    Value.Check(projectSchema, value),
    "config",
    "Expected v2 config with primaryRepository, primaryBranch and optional preferredLanguage only.",
  );
  invariant(
    /^[\w.-]+\/[\w.-]+$/.test(value.primaryRepository) &&
      !value.primaryRepository.endsWith(".git"),
    "config",
    "primaryRepository must be owner/repository, never a URL or credentials.",
  );
  invariant(
    !value.primaryBranch.startsWith("-") &&
      !/[\s~^:?*[\]\\]/.test(value.primaryBranch) &&
      !value.primaryBranch.includes("..") &&
      !value.primaryBranch.endsWith(".lock"),
    "config",
    "Invalid primary branch.",
  );
  if (value.preferredLanguage) language(value.preferredLanguage);
  return value;
}
export function userLanguage(source?: string): string | undefined {
  if (source === undefined) return undefined;
  const schema = Type.Object(
    {
      version: Type.Optional(Type.Literal(1)),
      preferredLanguage: Type.Optional(nonempty),
    },
    closed,
  );
  const value = yamlObject(source);
  invariant(
    Value.Check(schema, value),
    "config",
    "Invalid user config; expected version 1 and optional preferredLanguage (versionless compatibility is supported).",
  );
  return value.preferredLanguage === undefined
    ? undefined
    : language(value.preferredLanguage);
}
export function validIdeaId(id: string): boolean {
  if (!/^[0-9]{12}[a-f0-9]{4}$/.test(id)) return false;
  const iso = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:${id.slice(10, 12)}:00.000Z`;
  const date = new Date(iso);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString() === iso &&
    id.slice(0, 4) !== "0000"
  );
}
export function newIdeaId(
  now = new Date(),
  random: () => Uint8Array = () => randomBytes(2),
): string {
  const bytes = random();
  invariant(
    bytes.length === 2,
    "idea-id",
    "Idea ID randomness must be exactly two bytes.",
  );
  const id =
    now.toISOString().slice(0, 16).replaceAll(/[-T:]/g, "") +
    Buffer.from(bytes).toString("hex");
  invariant(
    validIdeaId(id),
    "idea-id",
    "Idea creation time is outside the supported calendar.",
  );
  return id;
}
export function parseBootstrap(source: string, id: string): Bootstrap {
  const value: unknown = JSON.parse(source);
  invariant(
    Value.Check(BootstrapSchema, value) && value.id === id && validIdeaId(id),
    "bootstrap",
    "Invalid or mismatched idea.json bootstrap.",
  );
  CID.parse(value.checkCid);
  invariant(
    validTimestamp(value.createdAt),
    "bootstrap",
    "Invalid creation timestamp.",
  );
  invariant(
    id.startsWith(value.createdAt.slice(0, 16).replaceAll(/[-T:]/g, "")),
    "bootstrap",
    "Creation timestamp must match the Idea ID's UTC minute.",
  );
  return value;
}
function validTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
export function safeRelative(path: string): boolean {
  return (
    path.length < 512 &&
    path
      .split("/")
      .every(
        (part) =>
          /^[^\\:]+$/.test(part) &&
          [...part].every((character) => character.charCodeAt(0) >= 32) &&
          part !== "." &&
          part !== ".." &&
          !part.endsWith(".") &&
          !part.endsWith(" ") &&
          !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  );
}
export function requiredText(files: Files, path: string): string {
  const bytes = files.get(path);
  invariant(
    bytes && bytes.byteLength <= 1024 * 1024,
    "layout",
    `Missing or oversized required file: ${path}`,
  );
  const content = text(bytes);
  invariant(content.trim(), "layout", `Empty required file: ${path}`);
  return content;
}
export function revisions(files: Files): Revisions {
  const ranges: Record<Gate, (path: string) => boolean> = {
    requirements: (path) => path.startsWith("requirements/"),
    research: (path) => path === "technical/research.md",
    technical: (path) =>
      path.startsWith("technical/") && path !== "technical/research.md",
    cases: (path) => path === "tests/cases.json",
    tests: (path) => path.startsWith("tests/") && path !== "tests/cases.json",
  };
  for (const path of [
    "requirements/Spec.md",
    "technical/research.md",
    "technical/Spec.md",
    "tests/cases.json",
    "tests/Spec.md",
  ])
    requiredText(files, path);
  return Object.fromEntries(
    gates.map((gate) => [
      gate,
      digest(
        canonical(
          [...files]
            .filter(([path]) => ranges[gate](path))
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([path, bytes]) => [path, digest(bytes)]),
        ),
      ),
    ]),
  ) as Revisions;
}
export function caseIndex(files: Files): CaseIndex {
  const value: unknown = JSON.parse(requiredText(files, "tests/cases.json"));
  invariant(
    Value.Check(caseIndexSchema, value),
    "cases",
    "Invalid tests/cases.json.",
  );
  invariant(
    new Set(value.cases.map((item) => item.id)).size === value.cases.length,
    "cases",
    "Duplicate case IDs.",
  );
  invariant(
    ["implementation", "deployment"].every((phase) =>
      value.cases.some((item) => item.phase === phase),
    ),
    "cases",
    "Both implementation and deployment cases are required.",
  );
  invariant(
    value.cases.every((item) =>
      item.phase === "implementation"
        ? item.subject === "git-head"
        : item.subject === "implementation",
    ),
    "cases",
    "Implementation cases bind git-head; deployment cases bind implementation.",
  );
  return value;
}
export function parseEvents(source: string, bootstrap: Bootstrap): Event[] {
  invariant(
    Buffer.byteLength(source) <= 1024 * 1024 &&
      source.endsWith("\n") &&
      !source.includes("\r"),
    "events",
    "events.jsonl must be bounded UTF-8/LF with a final newline.",
  );
  const lines = source.slice(0, -1).split("\n");
  invariant(
    lines.length <= 4096,
    "events",
    "Event history exceeds 4096 records.",
  );
  const events = lines.map((line) => {
    const value: unknown = JSON.parse(line);
    invariant(
      Value.Check(eventsSchema, value) &&
        validTimestamp(value.at) &&
        canonical(value) === line,
      "events",
      "Invalid event schema, timestamp or canonical JSON.",
    );
    return value;
  });
  const [created] = events;
  invariant(
    created?.type === "created" &&
      created.idea === bootstrap.id &&
      created.checkCid === bootstrap.checkCid &&
      created.at === bootstrap.createdAt,
    "events",
    "The first event must match immutable bootstrap metadata.",
  );
  invariant(
    events.slice(1).every((event) => event.type !== "created") &&
      new Set(events.map((event) => event.id)).size === events.length,
    "events",
    "Duplicate creation or request ID.",
  );
  const batches = new Set<string>();
  const signed = new Map<Gate, Extract<Event, { type: "signOff" }>>();
  let abandoned = false;
  for (const event of events) {
    if (event.type === "abandon") {
      invariant(!abandoned, "events", "Idea is already abandoned.");
      abandoned = true;
    } else if (event.type === "resume") {
      invariant(abandoned, "events", "Resume requires prior abandonment.");
      abandoned = false;
    } else
      invariant(
        !abandoned,
        "events",
        "No lifecycle facts may be recorded while abandoned.",
      );
    if (event.type === "created" && event.language !== undefined)
      language(event.language);
    if (event.type === "setLanguage" && event.language !== null)
      language(event.language);
    if (event.type === "signOff") {
      const previous = gates.slice(0, gates.indexOf(event.object));
      invariant(
        Object.keys(event.upstream).length === previous.length &&
          previous.every((gate) => event.upstream[gate]),
        "events",
        "Signoff must bind the exact preceding version vector.",
      );
      invariant(
        previous.every((gate) => {
          const approval = signed.get(gate);
          return (
            approval !== undefined &&
            approval.revision === event.upstream[gate] &&
            Object.entries(approval.upstream).every(
              ([key, value]) => event.upstream[key as Gate] === value,
            )
          );
        }),
        "events",
        "A signoff cannot invent missing or inconsistent upstream decisions.",
      );
      signed.set(event.object, event);
    }
    if (event.type === "verify") {
      invariant(
        gates.every(
          (gate) => signed.get(gate)?.revision === event.batch.revisions[gate],
        ),
        "events",
        "Evidence must follow all five matching explicit signoffs.",
      );
      invariant(
        !batches.has(event.batch.id),
        "events",
        "Evidence batch IDs are append-only and unique.",
      );
      batches.add(event.batch.id);
      invariant(
        event.batch.results.every((result) =>
          result.evidence.every(
            (ref) =>
              safeRelative(ref.path) &&
              ref.path.startsWith(`evidence/${event.batch.phase}/`),
          ),
        ),
        "evidence",
        "Evidence must be a regular, phase-owned relative file.",
      );
      invariant(
        new Set(event.batch.results.map((result) => result.case)).size ===
          event.batch.results.length,
        "evidence",
        "Duplicate case results.",
      );
      invariant(
        event.batch.phase === "deployment"
          ? !!event.batch.implementation
          : !event.batch.implementation,
        "evidence",
        "Deployment binds its implementation batch; implementation cannot.",
      );
    }
  }
  return events;
}
export interface Idea {
  readonly bootstrap: Bootstrap;
  readonly files: Files;
  readonly revisions: Revisions;
  readonly cases: CaseIndex;
  readonly events: readonly Event[];
  readonly eventSource: string;
}
export function idea(files: Files, id: string): Idea {
  invariant(
    [...files.keys()].every(
      (path) =>
        safeRelative(path) &&
        /^(?:idea\.json|events\.jsonl|requirements\/.+|technical\/.+|tests\/.+|evidence\/(?:implementation|deployment)\/.+)$/.test(
          path,
        ),
    ),
    "layout",
    "Unknown path in new Idea; no ledger or nested worlds are supported.",
  );
  const bootstrap = parseBootstrap(requiredText(files, "idea.json"), id);
  const eventSource = requiredText(files, "events.jsonl");
  return {
    bootstrap,
    files,
    revisions: revisions(files),
    cases: caseIndex(files),
    events: parseEvents(eventSource, bootstrap),
    eventSource,
  };
}
export interface State {
  readonly level:
    | Gate
    | "synchronization"
    | "implementation"
    | "deployment"
    | "completed"
    | "abandoned";
  readonly contentLanguage: string;
  readonly alias: string | null;
  readonly abandoned: boolean;
  readonly revisions: Revisions;
  readonly signed: Partial<Record<Gate, string>>;
  readonly next?: Gate;
  readonly implementation?: string;
  readonly deployment?: string;
}
export function vectorAt(vector: Revisions, gate: Gate): Partial<Revisions> {
  return Object.fromEntries(
    gates.slice(0, gates.indexOf(gate)).map((key) => [key, vector[key]]),
  );
}
export function matchingSignoff(
  event: Event,
  current: Revisions,
  gate: Gate,
): boolean {
  return (
    event.type === "signOff" &&
    event.object === gate &&
    event.revision === current[gate] &&
    canonical(event.upstream) === canonical(vectorAt(current, gate))
  );
}
export function validBatch(
  batch: Batch,
  current: Idea,
  head: string,
  implementation?: string,
  requirePassing = true,
): boolean {
  const needed = current.cases.cases.filter(
    (item) =>
      item.phase === batch.phase && item.environment === batch.environment,
  );
  return (
    needed.length > 0 &&
    canonical(batch.revisions) === canonical(current.revisions) &&
    (batch.phase === "implementation"
      ? batch.subject === head
      : batch.subject === head && batch.implementation === implementation) &&
    batch.results.length === needed.length &&
    needed.every((item) => {
      const result = batch.results.find((result) => result.case === item.id);
      return (
        result !== undefined &&
        (!requirePassing || result.result === "pass") &&
        result.evidence.length > 0 &&
        result.evidence.every((ref) => {
          const bytes = current.files.get(ref.path);
          return !!bytes?.byteLength && digest(bytes) === ref.digest;
        })
      );
    })
  );
}
export function ideaFacts(
  current: Idea,
  options: {
    projectLanguage?: string;
    userLanguage?: string;
  },
) {
  let override: string | undefined;
  let alias: string | null = null;
  let abandoned = false;
  for (const event of current.events) {
    if (event.type === "created") override = event.language;
    if (event.type === "setLanguage") override = event.language ?? undefined;
    if (event.type === "setAlias") alias = event.alias;
    if (event.type === "abandon") abandoned = true;
    if (event.type === "resume") abandoned = false;
  }
  return {
    contentLanguage:
      override ?? options.projectLanguage ?? options.userLanguage ?? "en-US",
    alias,
    abandoned,
    revisions: current.revisions,
  };
}
export function reduce(
  current: Idea,
  options: {
    projectLanguage?: string;
    userLanguage?: string;
    primary?: Idea;
    head: string;
    subjects?: readonly string[];
  },
): State {
  const base = ideaFacts(current, options);
  const signed: Partial<Record<Gate, string>> = {};
  if (base.abandoned) return { ...base, level: "abandoned", signed };
  for (const gate of gates) {
    const signoff = current.events.findLast((event) =>
      matchingSignoff(event, current.revisions, gate),
    );
    if (!signoff) return { ...base, level: gate, signed };
    signed[gate] = signoff.id;
    const primary = options.primary;
    if (
      !primary ||
      !gates
        .slice(0, gates.indexOf(gate) + 1)
        .every((key) => primary.revisions[key] === current.revisions[key]) ||
      !primary.events.some((event) => canonical(event) === canonical(signoff))
    )
      return { ...base, level: "synchronization", next: gate, signed };
  }
  const batches = current.events
    .filter((event) => event.type === "verify")
    .map((event) => event.batch);
  const subject = (batch: Batch) =>
    options.subjects?.includes(batch.subject) ? batch.subject : options.head;
  const phaseDigest = (
    phase: Batch["phase"],
    implementation?: string,
  ): string | undefined => {
    const environments = [
      ...new Set(
        current.cases.cases
          .filter((item) => item.phase === phase)
          .map((item) => item.environment),
      ),
    ].sort();
    const selected = environments.map((environment) => {
      const batch = batches.findLast(
        (batch) => batch.phase === phase && batch.environment === environment,
      );
      return batch && validBatch(batch, current, subject(batch), implementation)
        ? batch
        : undefined;
    });
    return selected.every((batch) => batch !== undefined)
      ? digest(canonical(selected))
      : undefined;
  };
  const implementationDigest = phaseDigest("implementation");
  if (!implementationDigest)
    return { ...base, level: "implementation", signed };
  const deploymentDigest = phaseDigest("deployment", implementationDigest);
  if (!deploymentDigest)
    return {
      ...base,
      level: "deployment",
      signed,
      implementation: implementationDigest,
    };
  return {
    ...base,
    level: "completed",
    signed,
    implementation: implementationDigest,
    deployment: deploymentDigest,
  };
}
export function validateAppend(
  current: Idea,
  event: Event,
  state: State,
  confirmed: boolean,
): void {
  invariant(
    event.type !== "created",
    "event-order",
    "An Idea is created only once.",
  );
  invariant(
    !current.events.some((item) => item.id === event.id),
    "event-conflict",
    "Event request ID already exists.",
  );
  if (event.type === "signOff")
    invariant(
      confirmed &&
        event.object === state.level &&
        matchingSignoff(event, current.revisions, event.object),
      "decision",
      "Explicit human decision confirmation and the exact current gate/vector are required; a flag is not authentication.",
    );
  if (event.type === "verify") {
    invariant(
      ["implementation", "deployment", "completed"].includes(state.level) &&
        (event.batch.phase === "implementation" ||
          state.level !== "implementation"),
      "event-order",
      "Evidence requires all signed/synchronized standards and implementation before deployment.",
    );
    invariant(
      validBatch(
        event.batch,
        current,
        event.batch.subject,
        state.implementation,
        false,
      ),
      "evidence",
      "Batch must contain current nonempty evidence for every required case in its exact environment.",
    );
  }
  if (state.level === "abandoned")
    invariant(
      event.type === "resume",
      "event-order",
      "Resume explicitly before recording other facts.",
    );
  if (event.type === "resume")
    invariant(
      state.level === "abandoned",
      "event-order",
      "Only an abandoned Idea may resume.",
    );
}
