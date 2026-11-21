import { randomBytes } from "node:crypto";
import {
  canonical,
  digest,
  gates,
  idea,
  type PairedEvent,
  type Files,
  type SubmissionObject,
} from "../src/domain.js";
import { reportPath } from "../src/lifecycle.js";
import { add, files as legacyFiles, id } from "./fixtures.js";

type Body<T> = T extends unknown ? Omit<T, "version" | "at" | "id"> : never;
export function pairedEvent<const T extends Body<PairedEvent>>(
  value: T,
): T & { version: 1; id: string; at: string } {
  return {
    ...value,
    version: 1,
    id: randomBytes(16).toString("hex"),
    at: new Date().toISOString(),
  };
}
export function files() {
  const source = legacyFiles();
  source.set(
    "tests/cases.json",
    Buffer.from(
      canonical({
        version: 1,
        cases: [
          { id: "I-01", phase: "implementation" },
          { id: "D-01", phase: "deployment" },
        ],
      }),
    ),
  );
  return source;
}
export function submit(
  source: Files,
  object: SubmissionObject,
  revision?: string,
) {
  const current = idea(source, id);
  const previous =
    object === "user-acceptance" ? "tests" : gates[gates.indexOf(object) - 1];
  return pairedEvent({
    type: "submit",
    object,
    revision:
      revision ??
      (object === "user-acceptance"
        ? digest(current.files.get(reportPath)!)
        : current.revisions[object]),
    upstream: previous ? current.revisions[previous] : null,
  });
}
export function sign(source: Files, object: SubmissionObject) {
  const request = submit(source, object);
  return add(
    add(source, request),
    pairedEvent({ type: "signOff", submit: request.id }),
  );
}
export function signed(source: Files = files()) {
  for (const gate of gates) source = sign(source, gate);
  return new Map(source);
}
export function report(implementation: string, result = "pass") {
  return (
    canonical({ version: 1, type: "start", implementation }) +
    "\n" +
    canonical({
      type: "case",
      case: "D-01",
      steps: "Run CLI",
      expected: "Expected output",
      actual: "Observed output",
      result,
    }) +
    "\n"
  );
}
export function deployed(source: Files, implementation: string) {
  const updated = new Map(source);
  updated.set(reportPath, Buffer.from(report(implementation)));
  return add(
    updated,
    pairedEvent({
      type: "verify",
      phase: "deployment",
      rev: digest(updated.get(reportPath)!),
    }),
  );
}
