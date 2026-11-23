import { describe, expect, it } from "vitest";
import {
  canonical,
  caseIndex,
  digest,
  gates,
  idea,
  parseEvents,
  reduce,
  validateAppend,
} from "../src/domain.js";
import {
  deploymentReport,
  pairedHistory,
  reportPath,
} from "../src/lifecycle.js";
import { verifyIdeaHistory } from "../src/repository.js";
import { add, event, head, id, signed as legacySigned } from "./fixtures.js";
import {
  deployed,
  files,
  report,
  sign,
  signed,
  submit,
  pairedEvent,
} from "./paired-fixtures.js";

describe("paired submissions with prepared content snapshots", () => {
  it("requires version 1, request-before-acceptance, explicit approval and synchronized exact content", () => {
    const source = files(),
      original = idea(source, id);
    const request = submit(source, "requirements");
    expect(caseIndex(source).version).toBe(1);
    expect(() =>
      parseEvents(
        original.eventSource + canonical({ ...request, version: 2 }) + "\n",
        original.bootstrap,
      ),
    ).toThrow(/Unsupported event protocol/);
    const indexed = new Map(source);
    indexed.set(
      "tests/cases.json",
      Buffer.from(canonical({ ...caseIndex(source), version: 2 })),
    );
    expect(() => caseIndex(indexed)).toThrow(/Invalid tests/);
    validateAppend(
      original,
      request,
      reduce(original, { head, primary: original }),
      false,
    );
    const pending = idea(add(source, request), id);
    const acceptance = pairedEvent({ type: "signOff", submit: request.id });
    expect(() => {
      validateAppend(
        pending,
        acceptance,
        reduce(pending, { head, primary: pending }),
        false,
      );
    }).toThrow(/Explicit/);
    validateAppend(
      pending,
      acceptance,
      reduce(pending, { head, primary: pending }),
      true,
    );
    const accepted = idea(add(pending.files, acceptance), id);
    expect(reduce(accepted, { head, primary: pending })).toMatchObject({
      level: "synchronization",
      next: "requirements",
    });
    expect(reduce(accepted, { head, primary: accepted }).level).toBe(
      "research",
    );
    const stale = new Map(pending.files);
    stale.set("requirements/Spec.md", Buffer.from("Changed"));
    const changed = idea(stale, id);
    expect(() => {
      validateAppend(
        changed,
        acceptance,
        reduce(changed, { head, primary: changed }),
        true,
      );
    }).toThrow(/Explicit/);
  });
  it("retains downstream chains only while predecessor content remains unchanged", () => {
    let source = signed();
    const request = submit(source, "requirements");
    source = add(source, request);
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("requirements");
    source = add(source, pairedEvent({ type: "signOff", submit: request.id }));
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("implementation");
    source.set("requirements/Spec.md", Buffer.from("New ancestor"));
    source = sign(sign(source, "requirements"), "research");
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("technical");
    for (const gate of gates.slice(2)) source = sign(source, gate);
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("implementation");
  });
  it("rejects orphan, duplicate, late and invalid-chain acceptance", () => {
    const source = files();
    expect(() =>
      idea(
        add(source, pairedEvent({ type: "signOff", submit: "0".repeat(32) })),
        id,
      ),
    ).toThrow(/earlier latest/);
    const first = submit(source, "requirements"),
      second = submit(source, "requirements");
    const requests = add(add(source, first), second);
    expect(() =>
      idea(
        add(requests, pairedEvent({ type: "signOff", submit: first.id })),
        id,
      ),
    ).toThrow(/earlier latest/);
    const approved = add(
      requests,
      pairedEvent({ type: "signOff", submit: second.id }),
    );
    expect(() =>
      idea(
        add(approved, pairedEvent({ type: "signOff", submit: second.id })),
        id,
      ),
    ).toThrow(/exactly once/);
    expect(() => idea(add(source, submit(source, "research")), id)).toThrow(
      /predecessor/,
    );
    expect(() =>
      idea(add(source, { ...first, upstream: digest("wrong") }), id),
    ).toThrow(/requirements uses null/);
    let chain = signed();
    const research = submit(chain, "research"),
      root = submit(chain, "requirements");
    chain = add(add(chain, research), root);
    expect(() =>
      idea(
        add(chain, pairedEvent({ type: "signOff", submit: research.id })),
        id,
      ),
    ).toThrow(/stale predecessor/);
    chain = signed();
    chain.set("requirements/Spec.md", Buffer.from("Different root"));
    chain = sign(chain, "requirements");
    expect(() => idea(add(chain, submit(chain, "technical")), id)).toThrow(
      /stale ancestor/,
    );
  });
  it("keeps legacy history readable but never counts it as paired approval or mixes new writes", () => {
    const legacy = idea(legacySigned(), id);
    expect(reduce(legacy, { head, primary: legacy }).level).toBe(
      "implementation",
    );
    expect(reduce(legacy, { head, primary: legacy, paired: true }).level).toBe(
      "requirements",
    );
    const source = add(legacy.files, submit(legacy.files, "requirements"));
    const signoff = event({
      type: "signOff",
      object: "requirements",
      revision: legacy.revisions.requirements,
      upstream: {},
    });
    expect(() => idea(add(source, signoff), id)).toThrow(
      /cannot append legacy/,
    );
    expect(() => {
      validateAppend(
        idea(source, id),
        signoff,
        reduce(idea(source, id), { head }),
        true,
      );
    }).toThrow(/cannot append legacy/);
    const invalid = { ...submit(files(), "requirements"), unexpected: true };
    expect(() => idea(add(files(), invalid), id)).toThrow(
      /Invalid event schema/,
    );
  });
});

describe("phase verification and cumulative report rules without Git execution", () => {
  it("requires synchronized verification and exact user acceptance, never reuses an earlier round", () => {
    let source = signed(),
      current = idea(source, id);
    const implementation = pairedEvent({
      type: "verify",
      phase: "implementation",
      rev: head,
    });
    validateAppend(
      current,
      implementation,
      reduce(current, { head, primary: current }),
      false,
    );
    source = add(source, implementation);
    current = idea(source, id);
    expect(
      reduce(current, { head, primary: current, subjects: [] }).level,
    ).toBe("implementation");
    expect(reduce(current, { head, primary: idea(signed(), id) }).level).toBe(
      "synchronization",
    );
    expect(reduce(current, { head, primary: current }).level).toBe(
      "deployment",
    );
    source = deployed(source, head);
    const deployment = idea(source, id);
    expect(reduce(deployment, { head, primary: current }).level).toBe(
      "deployment",
    );
    expect(reduce(deployment, { head, primary: deployment }).level).toBe(
      "user-acceptance",
    );
    const request = submit(source, "user-acceptance");
    const pending = idea(add(source, request), id);
    const approval = pairedEvent({ type: "signOff", submit: request.id });
    validateAppend(
      pending,
      approval,
      reduce(pending, { head, primary: pending }),
      true,
    );
    const accepted = idea(add(pending.files, approval), id);
    expect(reduce(accepted, { head, primary: pending })).toMatchObject({
      level: "synchronization",
      next: "user-acceptance",
    });
    expect(reduce(accepted, { head, primary: accepted }).level).toBe(
      "completed",
    );
    source = add(
      accepted.files,
      pairedEvent({ type: "verify", phase: "implementation", rev: head }),
    );
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("deployment");
    source = deployed(source, head);
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("user-acceptance");
  });
  it.each(["fail", "error", "blocked", "not-run"])(
    "blocks latest %s report until an append-only retry passes",
    (result) => {
      let source = deployed(
        add(
          signed(),
          pairedEvent({ type: "verify", phase: "implementation", rev: head }),
        ),
        head,
      );
      const previous = idea(source, id);
      const last = {
        type: "case",
        case: "D-01",
        steps: "Retry",
        expected: "Pass",
        actual: "Failed",
        result,
      };
      source.set(
        reportPath,
        Buffer.from(report(head) + canonical(last) + "\n"),
      );
      expect(() => idea(source, id)).toThrow(/current report bytes/);
      source = add(
        source,
        pairedEvent({
          type: "verify",
          phase: "deployment",
          rev: digest(source.get(reportPath)!),
        }),
      );
      const failed = idea(source, id);
      verifyIdeaHistory(failed, previous);
      expect(reduce(failed, { head, primary: failed }).level).toBe(
        "deployment",
      );
      source.set(
        reportPath,
        Buffer.from(
          new TextDecoder().decode(source.get(reportPath)) +
            canonical({ ...last, result: "pass", actual: "Retry succeeded" }) +
            "\n",
        ),
      );
      source = add(
        source,
        pairedEvent({
          type: "verify",
          phase: "deployment",
          rev: digest(source.get(reportPath)!),
        }),
      );
      expect(
        reduce(idea(source, id), { head, primary: idea(source, id) }).level,
      ).toBe("user-acceptance");
    },
  );
  it.each([
    () => canonical({ version: 1, type: "start", implementation: head }) + "\n",
    () => report("b".repeat(40)),
    () => report(head).replaceAll("D-01", "D-UNKNOWN"),
    () =>
      report(head) +
      canonical({ version: 1, type: "start", implementation: head }) +
      "\n",
  ])(
    "rejects incomplete, mismatched, unknown-case or superseded reports",
    (makeReport) => {
      const source = add(
        signed(),
        pairedEvent({ type: "verify", phase: "implementation", rev: head }),
      );
      source.set(reportPath, Buffer.from(makeReport()));
      const current = idea(
        add(
          source,
          pairedEvent({
            type: "verify",
            phase: "deployment",
            rev: digest(source.get(reportPath)!),
          }),
        ),
        id,
      );
      expect(reduce(current, { head, primary: current }).level).toBe(
        "deployment",
      );
    },
  );
  it("rejects malformed/oversized rows, excess rounds/cases and protects raw prefixes", () => {
    const source = files();
    source.set(reportPath, Buffer.from(report(head)));
    const original = idea(source, id);
    for (const content of [
      "",
      " \n",
      "{}\n",
      report(head).replace(/\n$/, ""),
      report(head).replaceAll("\n", "\r\n"),
      canonical({
        type: "case",
        case: "D-01",
        steps: "Do",
        expected: "Expect",
        actual: "Actual",
        result: "pass",
      }) + "\n",
      canonical({ version: 2, type: "start", implementation: head }) + "\n",
      canonical({
        version: 1,
        type: "start",
        implementation: head,
        context: "",
      }) + "\n",
      " ".repeat(1024 * 1024 + 1),
      report(head).repeat(2049),
      `{"version":1,"version":1,"type":"start","implementation":"${head}"}\n`,
    ]) {
      const invalid = new Map(source);
      invalid.set(reportPath, Buffer.from(content));
      expect(() => deploymentReport(invalid)).toThrow();
    }
    const removed = new Map(source);
    removed.delete(reportPath);
    expect(() => {
      verifyIdeaHistory(idea(removed, id), original);
    }).toThrow(/byte prefix/);
    const rewritten = new Map(source);
    rewritten.set(reportPath, Buffer.from(report(head, "fail")));
    expect(() => {
      verifyIdeaHistory(idea(rewritten, id), original);
    }).toThrow(/byte prefix/);
    const excess = new Map(source);
    excess.set(
      reportPath,
      Buffer.from(
        canonical({ version: 1, type: "start", implementation: head }) +
          "\n" +
          Array.from(
            { length: 513 },
            (_, index) =>
              canonical({
                type: "case",
                case: `D-${index}`,
                steps: "Do",
                expected: "Expect",
                actual: "Actual",
                result: "pass",
              }) + "\n",
          ).join(""),
      ),
    );
    expect(() => deploymentReport(excess)).toThrow(/512 cases/);
  });
  it("rejects premature/wrong-delivery verification, abandoned writes and stale object revisions", () => {
    const original = idea(files(), id);
    const verify = pairedEvent({
      type: "verify",
      phase: "implementation",
      rev: head,
    });
    expect(() => {
      validateAppend(
        original,
        verify,
        reduce(original, { head, primary: original }),
        false,
      );
    }).toThrow(/signed/);
    expect(() => idea(add(original.files, verify), id)).toThrow(/five paired/);
    const standards = signed();
    expect(() =>
      idea(
        add(
          standards,
          pairedEvent({
            type: "verify",
            phase: "deployment",
            rev: digest("missing"),
          }),
        ),
        id,
      ),
    ).toThrow(/earlier implementation/);
    expect(() =>
      idea(
        add(standards, submit(standards, "user-acceptance", digest("unknown"))),
        id,
      ),
    ).toThrow(/implementation and deployment/);
    const abandoned = idea(
      add(files(), event({ type: "abandon", reason: "Stop" })),
      id,
    );
    expect(() => {
      validateAppend(
        abandoned,
        submit(abandoned.files, "requirements"),
        reduce(abandoned, { head }),
        false,
      );
    }).toThrow(/Resume/);
    const current = idea(standards, id);
    expect(() => {
      validateAppend(
        current,
        { ...submit(current.files, "research"), revision: digest("wrong") },
        reduce(current, { head, primary: current }),
        false,
      );
    }).toThrow(/current object/);
    expect(pairedHistory(current.events).latest.size).toBe(5);
  });
});
