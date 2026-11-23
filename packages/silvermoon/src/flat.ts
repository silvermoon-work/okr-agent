import { createHash } from "node:crypto";
import {
  Type,
  FormatRegistry,
  type Static,
  type TSchema,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { CID } from "multiformats/cid";
import { base32 } from "multiformats/bases/base32";
import { create } from "multiformats/hashes/digest";
import {
  canonical,
  invariant,
  language,
  safeRelative,
  text,
  validIdeaId,
  type Files,
  type Idea,
} from "./domain.js";

import {
  checkpoints,
  type Checkpoint,
  type AcceptanceMode,
  type AcceptancePolicy,
} from "./flat-ids.js";
export {
  checkpoints,
  type Checkpoint,
  type AcceptanceMode,
  type AcceptancePolicy,
} from "./flat-ids.js";
export type TreeRevisions = Record<Checkpoint, string>;
export const titles: Record<Checkpoint, string> = {
  requirements: "需求规格",
  "research-scope": "调研范围",
  "technical-spec": "技术规格",
  "test-scope": "测试范围",
  "test-spec": "测试规格",
  implementation: "实现交付物",
  deployment: "部署交付物",
};
const closed = { additionalProperties: false };
const nonempty = Type.String({ minLength: 1, pattern: "\\S" });
const atSchema = Type.String({ format: "date-time" });
FormatRegistry.Set("date-time", timestamp);
const tree = Type.String({ pattern: "^(?:[a-f0-9]{40}|[a-f0-9]{64})$" });
const tuple = {
  at: atSchema,
  object: Type.Union(checkpoints.map((id) => Type.Literal(id))),
  revision: tree,
  upstream: Type.Union([Type.Null(), tree]),
};
const schema = Type.Union([
  Type.Object(
    {
      at: atSchema,
      type: Type.Literal("created"),
      idea: nonempty,
      eventSchemaCid: nonempty,
      language: Type.Optional(nonempty),
    },
    closed,
  ),
  Type.Object({ ...tuple, type: Type.Literal("submit") }, closed),
  Type.Object(
    {
      ...tuple,
      type: Type.Literal("accept"),
      authority: Type.Union([Type.Literal("user"), Type.Literal("delegate")]),
    },
    closed,
  ),
  Type.Object(
    {
      at: atSchema,
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
      at: atSchema,
      type: Type.Literal("setLanguage"),
      language: Type.Union([Type.Null(), nonempty]),
    },
    closed,
  ),
  Type.Object(
    { at: atSchema, type: Type.Literal("abandon"), reason: nonempty },
    closed,
  ),
  Type.Object({ at: atSchema, type: Type.Literal("resume") }, closed),
]);
export type FlatEvent = Static<typeof schema>;
export type TupleEvent = Extract<FlatEvent, { type: "submit" | "accept" }>;

/** RFC 8785 §§3.2.2–3.2.3: ECMAScript serialization and UTF-16 key order.
 * Reject non-I-JSON values before using the shared recursive serializer. */
export function jcs(value: unknown): string {
  const validate = (item: unknown): void => {
    if (typeof item === "number")
      invariant(
        Number.isFinite(item),
        "invalid-json",
        "JCS forbids non-finite numbers.",
      );
    else if (typeof item === "string")
      invariant(
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          item,
        ),
        "invalid-json",
        "JCS forbids lone Unicode surrogates.",
      );
    else if (Array.isArray(item)) item.forEach(validate);
    else if (item !== null && typeof item === "object")
      for (const [key, child] of Object.entries(item)) {
        validate(key);
        validate(child);
      }
    else
      invariant(
        item === null || typeof item === "boolean",
        "invalid-json",
        "Expected an I-JSON value.",
      );
  };
  validate(value);
  return canonical(value);
}
export const eventSchema: TSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...schema,
};
function freezeSchema(value: unknown): void {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeSchema);
    Object.freeze(value);
  }
}
freezeSchema(schema);
freezeSchema(eventSchema);
const schemaBytes = Buffer.from(jcs(eventSchema), "utf8");
export function eventSchemaBytes(): Uint8Array {
  return Uint8Array.from(schemaBytes);
}
export const eventSchemaCid = CID.createV1(
  0x55,
  create(0x12, createHash("sha256").update(schemaBytes).digest()),
).toString(base32);

export interface FlatIdea {
  readonly bootstrap: {
    readonly id: string;
    readonly createdAt: string;
    readonly eventSchemaCid: string;
  };
  readonly files: Files;
  readonly revisions: TreeRevisions;
  readonly events: readonly FlatEvent[];
  readonly eventSource: string;
}
export type AnyIdea = Idea | FlatIdea;
export function isFlatIdea(idea: AnyIdea): idea is FlatIdea {
  return "eventSchemaCid" in idea.bootstrap;
}
function timestamp(at: string): boolean {
  const date = new Date(at);
  return Number.isFinite(date.getTime()) && date.toISOString() === at;
}
export function parseFlatEvents(source: string, id: string): FlatEvent[] {
  invariant(
    Buffer.byteLength(source) <= 1024 * 1024 &&
      source.endsWith("\n") &&
      !source.includes("\r"),
    "events",
    "events.jsonl must be bounded canonical UTF-8/LF with a final newline.",
  );
  const lines = source.slice(0, -1).split("\n");
  invariant(
    lines.length <= 4096,
    "capacity",
    "Event history exceeds 4096 rows.",
  );
  const first: unknown = JSON.parse(lines[0]!);
  // This bounded fixed reader discovers only identity and trust, not lifecycle facts.
  invariant(
    first !== null &&
      typeof first === "object" &&
      "type" in first &&
      first.type === "created" &&
      "idea" in first &&
      first.idea === id &&
      validIdeaId(id) &&
      "at" in first &&
      typeof first.at === "string" &&
      timestamp(first.at) &&
      "eventSchemaCid" in first &&
      typeof first.eventSchemaCid === "string",
    "identity",
    "First row must declare created identity, time and eventSchemaCid.",
  );
  invariant(
    first.eventSchemaCid === eventSchemaCid,
    "schema-trust",
    "Unknown or untrusted event Schema CID; no fallback or implicit migration is allowed.",
  );
  invariant(
    id.startsWith(first.at.slice(0, 16).replaceAll(/[-T:]/g, "")),
    "identity",
    "Creation time must match the Idea ID's UTC minute.",
  );
  const events = lines.map((line) => {
    const event: unknown = JSON.parse(line);
    invariant(
      Value.Check(schema, event) && timestamp(event.at) && jcs(event) === line,
      "events",
      "Event does not satisfy the immutable trusted Schema or canonical encoding.",
    );
    if (
      (event.type === "created" || event.type === "setLanguage") &&
      event.language !== undefined &&
      event.language !== null
    )
      language(event.language);
    return event;
  });
  invariant(
    events.slice(1).every((event) => event.type !== "created"),
    "events",
    "Creation must be first and unique.",
  );
  flatHistory(events);
  return events;
}

export function acceptanceModes(
  policy: AcceptancePolicy = {},
): Record<Checkpoint, AcceptanceMode> {
  return Object.fromEntries(
    checkpoints.map((id) => [
      id,
      policy[id] ??
        (id === "test-spec" || id === "implementation"
          ? "delegated"
          : "consensus"),
    ]),
  ) as Record<Checkpoint, AcceptanceMode>;
}
interface Request {
  readonly event: Extract<FlatEvent, { type: "submit" }>;
  readonly predecessor?: Request;
  readonly accepted: Extract<FlatEvent, { type: "accept" }>[];
}
function sameTuple(a: TupleEvent, b: TupleEvent): boolean {
  return (
    a.object === b.object &&
    a.revision === b.revision &&
    a.upstream === b.upstream
  );
}
export function flatHistory(events: readonly FlatEvent[]) {
  const latest = new Map<Checkpoint, Request>();
  let abandoned = false;
  const valid = (request: Request | undefined): boolean =>
    !!request &&
    latest.get(request.event.object) === request &&
    request.accepted.length > 0 &&
    (!request.predecessor || valid(request.predecessor));
  for (const event of events) {
    if (event.type === "abandon") {
      invariant(!abandoned, "events", "Idea is already abandoned.");
      abandoned = true;
    } else if (event.type === "resume") {
      invariant(abandoned, "events", "Resume requires abandonment.");
      abandoned = false;
    } else {
      invariant(
        !abandoned,
        "events",
        "Resume before recording lifecycle facts.",
      );
      if (event.type !== "submit" && event.type !== "accept") continue;
      const parent = checkpoints[checkpoints.indexOf(event.object) - 1];
      const previous = parent ? latest.get(parent) : undefined;
      invariant(
        parent
          ? valid(previous) && previous?.event.revision === event.upstream
          : event.upstream === null,
        "events",
        "Lifecycle fact requires the accepted current direct predecessor; root upstream is null.",
      );
      const request = latest.get(event.object);
      if (event.type === "submit") {
        if (
          request &&
          sameTuple(request.event, event) &&
          request.predecessor === previous
        )
          continue;
        latest.set(event.object, {
          event,
          accepted: [],
          ...(previous ? { predecessor: previous } : {}),
        });
      } else {
        invariant(
          request &&
            sameTuple(request.event, event) &&
            request.predecessor === previous,
          "events",
          "Acceptance must follow the latest submission with the same complete tuple.",
        );
        request.accepted.push(event);
      }
    }
  }
  return { latest, abandoned };
}

export function gitObject(
  kind: "blob" | "tree",
  bytes: Uint8Array,
  format: "sha1" | "sha256",
): string {
  return createHash(format)
    .update(`${kind} ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}
export type Modes = ReadonlyMap<string, "100644" | "100755">;
/** Hash an ordinary directory tree, preserving Git modes and raw object IDs. */
export function directoryTree(
  files: Files,
  modes: Modes = new Map(),
  format: "sha1" | "sha256" = "sha1",
): string {
  const children = new Map<string, Map<string, Uint8Array>>();
  const entries: {
    name: string;
    mode: string;
    oid: string;
    directory: boolean;
  }[] = [];
  for (const [path, bytes] of files) {
    invariant(safeRelative(path), "path", "Unsafe directory path.");
    const slash = path.indexOf("/");
    if (slash < 0)
      entries.push({
        name: path,
        mode: modes.get(path) ?? "100644",
        oid: gitObject("blob", bytes, format),
        directory: false,
      });
    else {
      const name = path.slice(0, slash);
      let group = children.get(name);
      if (!group) {
        group = new Map();
        children.set(name, group);
      }
      group.set(path.slice(slash + 1), bytes);
    }
  }
  for (const [name, group] of children) {
    invariant(
      !entries.some((entry) => entry.name === name),
      "path",
      "A path cannot be both a file and a directory.",
    );
    const childModes = new Map(
      [...modes]
        .filter(([path]) => path.startsWith(name + "/"))
        .map(([path, mode]) => [path.slice(name.length + 1), mode]),
    );
    entries.push({
      name,
      mode: "40000",
      oid: directoryTree(group, childModes, format),
      directory: true,
    });
  }
  entries.sort((a, b) =>
    Buffer.compare(
      Buffer.from(a.name + (a.directory ? "/" : "")),
      Buffer.from(b.name + (b.directory ? "/" : "")),
    ),
  );
  return gitObject(
    "tree",
    Buffer.concat(
      entries.map(({ name, mode, oid }) =>
        Buffer.concat([
          Buffer.from(`${mode} ${name}\0`),
          Buffer.from(oid, "hex"),
        ]),
      ),
    ),
    format,
  );
}
export function flatIdea(
  files: Files,
  id: string,
  modes?: Modes,
  format?: "sha1" | "sha256",
): FlatIdea {
  invariant(
    [...files.keys()].every(
      (path) =>
        safeRelative(path) &&
        (path === "events.jsonl" ||
          checkpoints.some((id) => path.startsWith(id + "/"))),
    ),
    "layout",
    "Flat Ideas contain events.jsonl and the seven checkpoint folders only.",
  );
  const bytes = files.get("events.jsonl");
  invariant(bytes, "layout", "Missing events.jsonl.");
  invariant(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    "events",
    "Canonical UTF-8 events cannot contain a BOM.",
  );
  const eventSource = text(bytes);
  const events = parseFlatEvents(eventSource, id);
  const created = events[0]!;
  invariant(created.type === "created", "identity", "Missing creation.");
  const revisions = Object.fromEntries(
    checkpoints.map((id) => {
      const prefix = id + "/";
      const group = new Map(
        [...files]
          .filter(([path]) => path.startsWith(prefix))
          .map(([path, bytes]) => [path.slice(prefix.length), bytes]),
      );
      invariant(
        group.size > 0,
        "layout",
        `Missing readable material folder: ${id}`,
      );
      const groupModes = new Map(
        [...(modes ?? [])]
          .filter(([path]) => path.startsWith(prefix))
          .map(([path, mode]) => [path.slice(prefix.length), mode]),
      );
      return [id, directoryTree(group, groupModes, format)];
    }),
  ) as TreeRevisions;
  return {
    bootstrap: {
      id,
      createdAt: created.at,
      eventSchemaCid: created.eventSchemaCid,
    },
    files,
    revisions,
    events,
    eventSource,
  };
}
export function flatFacts(
  current: FlatIdea,
  projectLanguage?: string,
  userLanguage?: string,
) {
  let override: string | undefined;
  let alias: string | null = null;
  for (const event of current.events) {
    if (event.type === "created") override = event.language;
    if (event.type === "setLanguage") override = event.language ?? undefined;
    if (event.type === "setAlias") alias = event.alias;
  }
  return {
    contentLanguage: override ?? projectLanguage ?? userLanguage ?? "en-US",
    alias,
    abandoned: flatHistory(current.events).abandoned,
    revisions: current.revisions,
  };
}
export interface FlatState extends ReturnType<typeof flatFacts> {
  readonly level: Checkpoint | "completed" | "abandoned";
  readonly step?: "submit" | "accept" | "synchronization";
  readonly acceptanceModes: Record<Checkpoint, AcceptanceMode>;
  readonly submitted: Partial<Record<Checkpoint, TupleEvent>>;
  readonly accepted: Partial<
    Record<Checkpoint, Extract<FlatEvent, { type: "accept" }>>
  >;
}
export function reduceFlat(
  current: FlatIdea,
  options: {
    primary?: FlatIdea;
    policy?: AcceptancePolicy;
    projectLanguage?: string;
    userLanguage?: string;
  } = {},
): FlatState {
  const facts = flatFacts(
    current,
    options.projectLanguage,
    options.userLanguage,
  );
  const history = flatHistory(current.events);
  const modes = acceptanceModes(options.policy);
  const submitted: FlatState["submitted"] = {};
  const accepted: FlatState["accepted"] = {};
  const state = { ...facts, acceptanceModes: modes, submitted, accepted };
  if (facts.abandoned) return { ...state, level: "abandoned" };
  for (const id of checkpoints) {
    const request = history.latest.get(id);
    const parent = checkpoints[checkpoints.indexOf(id) - 1];
    const upstream = parent ? current.revisions[parent] : null;
    if (
      !request ||
      request.event.revision !== current.revisions[id] ||
      request.event.upstream !== upstream ||
      (parent && request.predecessor !== history.latest.get(parent))
    )
      return { ...state, level: id, step: "submit" };
    submitted[id] = request.event;
    const acceptance = request.accepted.findLast(
      (event) => event.authority === "user" || modes[id] === "delegated",
    );
    if (!acceptance) return { ...state, level: id, step: "accept" };
    accepted[id] = acceptance;
    const primary = options.primary;
    if (
      !primary ||
      primary.revisions[id] !== current.revisions[id] ||
      !primary.events.some((event) => jcs(event) === jcs(request.event)) ||
      !primary.events.some((event) => jcs(event) === jcs(acceptance))
    )
      return { ...state, level: id, step: "synchronization" };
  }
  return { ...state, level: "completed" };
}
