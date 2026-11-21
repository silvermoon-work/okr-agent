import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { parseDocument } from "yaml";
import {
  canonical,
  digest,
  gates,
  ideaFacts,
  invariant,
  requiredText,
  type Event,
  type Files,
  type Gate,
  type Idea,
  type ReductionOptions,
  type Revisions,
  type State,
  type SubmissionObject,
} from "./domain.js";

export const reportPath = "evidence/deployment/report.jsonl";
const textField = Type.String({ minLength: 1, pattern: "\\S" });
const reportRow = Type.Union([
  Type.Object(
    {
      version: Type.Literal(1),
      type: Type.Literal("start"),
      implementation: Type.String({
        pattern: "^[a-f0-9]{40}(?:[a-f0-9]{24})?$",
      }),
      context: Type.Optional(textField),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("case"),
      case: Type.String({ pattern: "^[A-Z][A-Z0-9-]{0,63}$" }),
      steps: textField,
      expected: textField,
      actual: textField,
      result: Type.Union(
        ["pass", "fail", "error", "blocked", "not-run"].map((value) =>
          Type.Literal(value),
        ),
      ),
    },
    { additionalProperties: false },
  ),
]);
type ReportRow = Static<typeof reportRow>;
export function deploymentReport(files: Files) {
  const source = requiredText(files, reportPath);
  invariant(
    source.endsWith("\n") && !source.includes("\r"),
    "evidence",
    "Deployment report must use UTF-8/LF and a final newline.",
  );
  const lines = source.slice(0, -1).split("\n");
  invariant(
    lines.length <= 4096,
    "capacity",
    "Deployment report exceeds 4096 rows.",
  );
  let start: Extract<ReportRow, { type: "start" }> | undefined;
  const results = new Map<string, Extract<ReportRow, { type: "case" }>>();
  for (const line of lines) {
    const row: unknown = JSON.parse(line);
    const document = parseDocument(line, { schema: "json", uniqueKeys: true });
    invariant(
      !document.errors.length,
      "evidence",
      "Deployment report JSON must have unique keys.",
    );
    invariant(
      Value.Check(reportRow, row),
      "evidence",
      "Invalid deployment report row.",
    );
    if (row.type === "start") {
      start = row;
      results.clear();
    } else {
      invariant(
        start,
        "evidence",
        "Deployment report must start with a start row.",
      );
      results.set(row.case, row);
      invariant(
        results.size <= 512,
        "capacity",
        "Deployment round exceeds 512 cases.",
      );
    }
  }
  invariant(start, "evidence", "Deployment report requires a start row.");
  return { source, start, results };
}

type Submit = Extract<Event, { type: "submit" }>;
type SignOff = Extract<Event, { version: 2; type: "signOff" }>;
interface Request {
  readonly event: Submit;
  readonly ancestors: Partial<Revisions>;
  readonly implementation?: Event;
  readonly deployment?: Event;
  signOff?: SignOff;
}
function predecessor(object: SubmissionObject): Gate | undefined {
  return object === "user-acceptance"
    ? "tests"
    : gates[gates.indexOf(object) - 1];
}
function revisionsOf(request: Request): Partial<Revisions> {
  return {
    ...request.ancestors,
    ...(request.event.object === "user-acceptance"
      ? {}
      : { [request.event.object]: request.event.revision }),
  };
}

/** Capture each request's original ancestor revisions, never substitute later requests. */
export function pairedHistory(events: readonly Event[]) {
  const latest = new Map<SubmissionObject, Request>();
  const requests = new Map<string, Request>();
  let implementation: Event | undefined;
  let deployment: Event | undefined;
  for (const event of events) {
    if (event.version !== 2) continue;
    if (event.type === "submit") {
      const parent = predecessor(event.object);
      const previous = parent ? latest.get(parent) : undefined;
      invariant(
        parent
          ? previous?.signOff && previous.event.revision === event.upstream
          : event.upstream === null,
        "events",
        "Submission requires the confirmed direct predecessor revision; requirements uses null.",
      );
      const ancestors = previous ? revisionsOf(previous) : {};
      invariant(
        Object.entries(ancestors).every(([key, revision]) => {
          const request = latest.get(key as Gate);
          return (
            request?.signOff &&
            request.event.revision === revision &&
            canonical(request.ancestors) ===
              canonical(
                Object.fromEntries(
                  gates
                    .slice(0, gates.indexOf(key as Gate))
                    .map((gate) => [gate, ancestors[gate]]),
                ),
              )
          );
        }),
        "events",
        "Submission cannot inherit a stale ancestor confirmation chain.",
      );
      if (event.object === "user-acceptance")
        invariant(
          implementation?.type === "verify" &&
            implementation.version === 2 &&
            deployment?.type === "verify" &&
            deployment.version === 2 &&
            deployment.rev === event.revision,
          "events",
          "User acceptance must follow current implementation and deployment verification.",
        );
      const request: Request = {
        event,
        ancestors,
        ...(event.object === "user-acceptance" && implementation && deployment
          ? { implementation, deployment }
          : {}),
      };
      latest.set(event.object, request);
      requests.set(event.id, request);
    } else if (event.type === "signOff") {
      const request = requests.get(event.submit);
      invariant(
        request &&
          latest.get(request.event.object) === request &&
          !request.signOff,
        "events",
        "SignOff must reference an earlier latest submission exactly once.",
      );
      invariant(
        Object.entries(request.ancestors).every(([key, revision]) => {
          const ancestor = latest.get(key as Gate);
          return (
            ancestor?.signOff &&
            ancestor.event.revision === revision &&
            canonical(ancestor.ancestors) ===
              canonical(
                Object.fromEntries(
                  gates
                    .slice(0, gates.indexOf(key as Gate))
                    .map((gate) => [gate, request.ancestors[gate]]),
                ),
              )
          );
        }),
        "events",
        "SignOff cannot accept a submission with a stale predecessor chain.",
      );
      invariant(
        request.event.object !== "user-acceptance" ||
          (request.implementation === implementation &&
            request.deployment === deployment),
        "events",
        "User acceptance cannot confirm a superseded delivery verification.",
      );
      request.signOff = event;
    } else {
      invariant(
        gates.every((gate) => {
          const request = latest.get(gate);
          return (
            request?.signOff &&
            Object.entries(request.ancestors).every(
              ([key, revision]) =>
                latest.get(key as Gate)?.event.revision === revision,
            )
          );
        }),
        "events",
        "Verification requires all five paired confirmations.",
      );
      if (event.phase === "implementation") {
        implementation = event;
        deployment = undefined;
      } else {
        invariant(
          implementation,
          "events",
          "Deployment verification requires earlier implementation verification.",
        );
        deployment = event;
      }
    }
  }
  return { latest, requests, implementation, deployment };
}

export function reducePaired(current: Idea, options: ReductionOptions): State {
  const base = ideaFacts(current, options);
  const history = pairedHistory(current.events);
  const submitted = Object.fromEntries(
    [...history.latest].map(([object, request]) => [object, request.event.id]),
  );
  const signed: Partial<Record<SubmissionObject, string>> = {};
  const state = { ...base, submitted, signed };
  if (base.abandoned) return { ...state, level: "abandoned" };
  const primary = options.primary;
  const present = (event: Event) =>
    primary?.events.some((item) => canonical(item) === canonical(event));
  const confirmation = (object: SubmissionObject, revision: string) => {
    const request = history.latest.get(object);
    if (
      !request?.signOff ||
      request.event.revision !== revision ||
      !Object.entries(request.ancestors).every(
        ([gate, value]) => current.revisions[gate as Gate] === value,
      )
    )
      return { level: object } as const;
    if (
      object === "user-acceptance" &&
      (request.implementation !== history.implementation ||
        request.deployment !== history.deployment)
    )
      return { level: object } as const;
    signed[object] = request.signOff.id;
    if (
      !present(request.event) ||
      !present(request.signOff) ||
      !primary ||
      !gates
        .slice(
          0,
          object === "user-acceptance"
            ? gates.length
            : gates.indexOf(object) + 1,
        )
        .every((gate) => primary.revisions[gate] === current.revisions[gate])
    )
      return { level: "synchronization", next: object } as const;
    return undefined;
  };
  for (const gate of gates) {
    if (gate === "cases" && current.cases.version !== 2)
      return { ...state, level: gate };
    const gap = confirmation(gate, current.revisions[gate]);
    if (gap) return { ...state, ...gap };
  }
  const implementation = history.implementation;
  if (
    implementation?.type !== "verify" ||
    implementation.version !== 2 ||
    !(options.subjects ?? [options.head]).includes(implementation.rev)
  )
    return { ...state, level: "implementation" };
  const implemented = { ...state, implementation: implementation.rev };
  if (!present(implementation))
    return { ...implemented, level: "implementation" };
  const deployment = history.deployment;
  if (deployment?.type !== "verify" || deployment.version !== 2)
    return { ...implemented, level: "deployment" };
  const report = deploymentReport(current.files);
  const needed = current.cases.cases.filter(
    (item) => item.phase === "deployment",
  );
  if (
    report.start.implementation !== implementation.rev ||
    digest(report.source) !== deployment.rev ||
    report.results.size !== needed.length ||
    !needed.every((item) => report.results.get(item.id)?.result === "pass")
  )
    return { ...implemented, level: "deployment" };
  const deployed = { ...implemented, deployment: deployment.rev };
  if (
    !present(deployment) ||
    !primary ||
    !primary.files.get(reportPath) ||
    digest(primary.files.get(reportPath)!) !== deployment.rev
  )
    return { ...deployed, level: "deployment" };
  const gap = confirmation("user-acceptance", deployment.rev);
  return { ...deployed, ...(gap ?? { level: "completed" }) };
}

export function validatePairedAppend(
  current: Idea,
  event: Extract<Event, { version: 2 }>,
  state: State,
  confirmed: boolean,
): void {
  invariant(
    state.level !== "abandoned",
    "event-order",
    "Resume before recording lifecycle facts.",
  );
  if (event.type === "submit") {
    const object = event.object;
    const previous = predecessor(object);
    invariant(
      (state.level === object || !!state.signed[object]) &&
        (!previous || !!state.signed[previous]) &&
        event.revision ===
          (object === "user-acceptance"
            ? state.deployment
            : current.revisions[object]) &&
        event.upstream === (previous ? current.revisions[previous] : null),
      "event-order",
      "Submit requires the current object revision and synchronized predecessor.",
    );
  } else if (event.type === "signOff") {
    const history = pairedHistory(current.events);
    const request = history.requests.get(event.submit);
    invariant(
      confirmed &&
        request &&
        state.level === request.event.object &&
        state.submitted?.[request.event.object] === event.submit &&
        request.event.revision ===
          (request.event.object === "user-acceptance"
            ? state.deployment
            : current.revisions[request.event.object]) &&
        Object.entries(request.ancestors).every(
          ([gate, revision]) => current.revisions[gate as Gate] === revision,
        ) &&
        (request.event.object !== "user-acceptance" ||
          (request.implementation === history.implementation &&
            request.deployment === history.deployment)),
      "decision",
      "Explicit acceptance of the latest exact submission and current chain is required.",
    );
  } else {
    invariant(
      ["implementation", "deployment", "user-acceptance", "completed"].includes(
        state.level,
      ) &&
        (event.phase === "implementation" || !!state.implementation),
      "event-order",
      "Verification requires signed/synchronized standards and implementation before deployment.",
    );
    if (event.phase === "deployment")
      invariant(
        digest(deploymentReport(current.files).source) === event.rev,
        "evidence",
        "Deployment verify must reference the current report bytes.",
      );
  }
  pairedHistory([...current.events, event]);
}
