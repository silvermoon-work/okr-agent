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
import {
  git,
  readProject,
  selectIdea,
  validSubjects,
  verifyIdeaHistory,
} from "../src/repository.js";
import {
  add,
  event,
  head,
  id,
  materialize,
  repository,
  sync,
  files as legacyFiles,
  signed as legacySigned,
} from "./fixtures.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executeCheck } from "@silvermoon-work/check-task-sdk";
import { commitCheckpoints } from "../src/commit-check.js";
import {
  deployed,
  files,
  report,
  sign,
  signed,
  submit,
  pairedEvent,
} from "./paired-fixtures.js";

describe("paired submissions and precise ancestry", () => {
  it("keeps unreleased paired events and indexes at version 1 and rejects version 2", () => {
    const source = files();
    const current = idea(source, id);
    const request = submit(source, "requirements");
    expect(request.version).toBe(1);
    expect(caseIndex(source).version).toBe(1);
    expect(() =>
      parseEvents(
        current.eventSource + canonical({ ...request, version: 2 }) + "\n",
        current.bootstrap,
      ),
    ).toThrow(/Unsupported event protocol version/);
    const unsupported = new Map(source);
    unsupported.set(
      "tests/cases.json",
      Buffer.from(
        canonical({
          ...caseIndex(source),
          version: 2,
        }),
      ),
    );
    expect(() => caseIndex(unsupported)).toThrow(/Invalid tests/);
  });
  it("requires a request before explicit acceptance and synchronizes both events", () => {
    const original = idea(files(), id);
    const request = submit(original.files, "requirements");
    validateAppend(
      original,
      request,
      reduce(original, { head, primary: original }),
      false,
    );
    const pending = idea(add(original.files, request), id);
    const state = reduce(pending, { head, primary: original });
    expect(state).toMatchObject({
      level: "requirements",
      submitted: { requirements: request.id },
      signed: {},
    });
    const approval = pairedEvent({ type: "signOff", submit: request.id });
    expect(() => {
      validateAppend(pending, approval, state, false);
    }).toThrow(/Explicit/);
    validateAppend(pending, approval, state, true);
    const accepted = idea(add(pending.files, approval), id);
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
        approval,
        reduce(changed, { head, primary: changed }),
        true,
      );
    }).toThrow(/Explicit/);
  });

  it("preserves unchanged downstream content chains across a new predecessor request but not new ancestors", () => {
    let source = signed();
    const pending = submit(source, "requirements");
    const before = idea(source, id);
    validateAppend(
      before,
      pending,
      reduce(before, { head, primary: before }),
      false,
    );
    source = add(source, pending);
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("requirements");
    source = add(source, pairedEvent({ type: "signOff", submit: pending.id }));
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("implementation");
    source.set("requirements/Spec.md", Buffer.from("New ancestor"));
    source = sign(source, "requirements");
    source = sign(source, "research");
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("technical");
    for (const gate of gates.slice(2)) source = sign(source, gate);
    expect(
      reduce(idea(source, id), { head, primary: idea(source, id) }).level,
    ).toBe("implementation");
  });

  it("rejects orphan, duplicate, late and invalid-chain acceptance without silently reusing requests", () => {
    const source = files();
    expect(() =>
      idea(
        add(source, pairedEvent({ type: "signOff", submit: "0".repeat(32) })),
        id,
      ),
    ).toThrow(/earlier latest/);
    const first = submit(source, "requirements");
    const second = submit(source, "requirements");
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
    const invalidRoot = { ...first, upstream: digest("invalid") };
    expect(() => idea(add(source, invalidRoot), id)).toThrow(
      /requirements uses null/,
    );
    let chain = signed();
    const research = submit(chain, "research");
    chain = add(chain, research);
    const newRoot = submit(chain, "requirements");
    chain = add(chain, newRoot);
    expect(() =>
      idea(
        add(chain, pairedEvent({ type: "signOff", submit: research.id })),
        id,
      ),
    ).toThrow(/stale predecessor/);
    chain = add(chain, pairedEvent({ type: "signOff", submit: newRoot.id }));
    chain = signed();
    chain.set("requirements/Spec.md", Buffer.from("Different root"));
    chain = sign(chain, "requirements");
    expect(() => idea(add(chain, submit(chain, "technical")), id)).toThrow(
      /stale ancestor/,
    );
  });

  it("keeps legacy histories readable without using them as paired approvals or allowing mixed new writes", () => {
    const legacy = idea(legacySigned(), id);
    expect(reduce(legacy, { head, primary: legacy }).level).toBe(
      "implementation",
    );
    expect(reduce(legacy, { head, primary: legacy, paired: true }).level).toBe(
      "requirements",
    );
    const source = add(legacy.files, submit(legacy.files, "requirements"));
    const legacySignoff = event({
      type: "signOff",
      object: "requirements",
      revision: legacy.revisions.requirements,
      upstream: {},
    });
    expect(() => idea(add(source, legacySignoff), id)).toThrow(
      /cannot append legacy/,
    );
    expect(() => {
      validateAppend(
        idea(source, id),
        legacySignoff,
        reduce(idea(source, id), { head }),
        true,
      );
    }).toThrow(/cannot append legacy/);
    const unknown = canonical({ ...legacy.events[0], version: 3 }) + "\n";
    expect(() => parseEvents(unknown, legacy.bootstrap)).toThrow(
      /Unsupported event protocol/,
    );
    const invalid = { ...submit(files(), "requirements"), unexpected: true };
    const extra = add(files(), invalid);
    expect(() => idea(extra, id)).toThrow(/Invalid event schema/);
    expect(legacyFiles().get("events.jsonl")).toBeDefined();
  });
});

describe("phase verification and cumulative deployment reports", () => {
  it("requires synchronized tests and implementation, validates latest reports, then waits for user acceptance", () => {
    let source = signed();
    let current = idea(source, id);
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
    const deployedFiles = deployed(source, head);
    const deployment = idea(deployedFiles, id);
    expect(reduce(deployment, { head, primary: current }).level).toBe(
      "deployment",
    );
    const state = reduce(deployment, { head, primary: deployment });
    expect(state).toMatchObject({
      level: "user-acceptance",
      implementation: head,
      deployment: digest(deployment.files.get(reportPath)!),
    });
    const request = submit(deployedFiles, "user-acceptance");
    validateAppend(deployment, request, state, false);
    const pending = idea(add(deployedFiles, request), id);
    const acceptance = pairedEvent({ type: "signOff", submit: request.id });
    validateAppend(
      pending,
      acceptance,
      reduce(pending, { head, primary: pending }),
      true,
    );
    const accepted = idea(add(pending.files, acceptance), id);
    expect(reduce(accepted, { head, primary: pending })).toMatchObject({
      level: "synchronization",
      next: "user-acceptance",
    });
    expect(reduce(accepted, { head, primary: accepted }).level).toBe(
      "completed",
    );
    const rerun = add(
      accepted.files,
      pairedEvent({ type: "verify", phase: "implementation", rev: head }),
    );
    expect(
      reduce(idea(rerun, id), { head, primary: idea(rerun, id) }).level,
    ).toBe("deployment");
    const redeployed = deployed(rerun, head);
    expect(
      reduce(idea(redeployed, id), { head, primary: idea(redeployed, id) })
        .level,
    ).toBe("user-acceptance");
  });

  it.each(["fail", "error", "blocked", "not-run"])(
    "blocks the latest %s result without falling back to success",
    (result) => {
      let source = add(
        signed(),
        pairedEvent({ type: "verify", phase: "implementation", rev: head }),
      );
      source = deployed(source, head);
      const previous = idea(source, id);
      const last = {
        type: "case",
        case: "D-01",
        steps: "Retry",
        expected: "Pass",
        actual: "Actual failure",
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
      const retry = { ...last, result: "pass", actual: "Real retry succeeded" };
      source.set(
        reportPath,
        Buffer.from(
          new TextDecoder().decode(source.get(reportPath)) +
            canonical(retry) +
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
      const passed = idea(source, id);
      expect(reduce(passed, { head, primary: passed }).level).toBe(
        "user-acceptance",
      );
    },
  );

  it("does not reuse an earlier round, mismatched implementation or unknown cases", () => {
    const source = add(
      signed(),
      pairedEvent({ type: "verify", phase: "implementation", rev: head }),
    );
    for (const content of [
      canonical({ version: 1, type: "start", implementation: head }) + "\n",
      report("b".repeat(40)),
      report(head).replaceAll("D-01", "D-UNKNOWN"),
      report(head) +
        canonical({ version: 1, type: "start", implementation: head }) +
        "\n",
    ]) {
      const candidate = new Map(source);
      candidate.set(reportPath, Buffer.from(content));
      const verified = idea(
        add(
          candidate,
          pairedEvent({
            type: "verify",
            phase: "deployment",
            rev: digest(content),
          }),
        ),
        id,
      );
      expect(reduce(verified, { head, primary: verified }).level).toBe(
        "deployment",
      );
    }
  });

  it("protects report prefixes and rejects malformed, oversized or unknown rows", () => {
    const originalFiles = files();
    originalFiles.set(reportPath, Buffer.from(report(head)));
    const original = idea(originalFiles, id);
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
        expected: "Expected",
        actual: "Observed",
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
      '{"version":1,"version":1,"type":"start","implementation":"' +
        head +
        '"}\n',
    ]) {
      const candidate = new Map(originalFiles);
      candidate.set(reportPath, Buffer.from(content));
      expect(() => deploymentReport(candidate)).toThrow();
    }
    const removed = new Map(originalFiles);
    removed.delete(reportPath);
    expect(() => {
      verifyIdeaHistory(idea(removed, id), original);
    }).toThrow(/byte prefix/);
    const rewritten = new Map(originalFiles);
    rewritten.set(reportPath, Buffer.from(report(head, "fail")));
    expect(() => {
      verifyIdeaHistory(idea(rewritten, id), original);
    }).toThrow(/byte prefix/);
    const tooMany = new Map(originalFiles);
    tooMany.set(
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
    expect(() => deploymentReport(tooMany)).toThrow(/512 cases/);
  });

  it("rejects premature verification, absent deployment and acceptance of the wrong delivery", () => {
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
    expect(reduce(abandoned, { head }).level).toBe("abandoned");
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

  describe("Git snapshot binding and staged report protection", () => {
    it("accepts only tested ancestor snapshots containing the five current versions and identical tracked code", async () => {
      const { root } = await repository();
      let source = signed();
      await materialize(root, source);
      await sync(root);
      const tested = await git(root, ["rev-parse", "HEAD"]);
      source = add(
        source,
        pairedEvent({ type: "verify", phase: "implementation", rev: tested }),
      );
      await materialize(root, source);
      await sync(root);
      let current = idea(source, id);
      expect(
        await validSubjects(
          root,
          current,
          await git(root, ["rev-parse", "HEAD"]),
        ),
      ).toContain(tested);
      await writeFile(
        join(root, ".silvermoon", "i", id, "evidence", "deployment", "run.txt"),
        "Updated metadata",
      );
      await sync(root);
      expect(
        await validSubjects(
          root,
          current,
          await git(root, ["rev-parse", "HEAD"]),
        ),
      ).toContain(tested);
      await writeFile(join(root, "source.txt"), "Changed tested code");
      await sync(root);
      expect(
        await validSubjects(
          root,
          current,
          await git(root, ["rev-parse", "HEAD"]),
        ),
      ).not.toContain(tested);
      await writeFile(join(root, "source.txt"), "Deliverable source v1\n");
      await sync(root);
      source.set("technical/Spec.md", Buffer.from("Different signed version"));
      await materialize(root, source);
      await sync(root);
      current = idea(source, id);
      expect(
        await validSubjects(
          root,
          current,
          await git(root, ["rev-parse", "HEAD"]),
        ),
      ).not.toContain(tested);
      const unknown = add(
        source,
        pairedEvent({
          type: "verify",
          phase: "implementation",
          rev: "f".repeat(40),
        }),
      );
      await expect(
        validSubjects(
          root,
          idea(unknown, id),
          await git(root, ["rev-parse", "HEAD"]),
        ),
      ).rejects.toThrow();
    });

    it("rejects staged report rewrites but allows append-only retries without execution or network", async () => {
      const { root } = await repository();
      const source = files();
      source.set(reportPath, Buffer.from(report(head)));
      await materialize(root, source);
      await sync(root);
      const run = () =>
        executeCheck({
          checkpoints: commitCheckpoints({
            entry: "",
            path: process.env.PATH ?? "",
          }),
          target: {
            userHome: process.env.USERPROFILE ?? root,
            repoRoot: root,
            snapshot: "staged",
          },
          signal: new AbortController().signal,
        });
      source.set(reportPath, Buffer.from(report(head, "fail")));
      await materialize(root, source);
      await git(root, ["add", "--all"]);
      expect(await run()).toMatchObject({
        pass: false,
        problems: [{ code: "commit-history-deployment-report-append-only" }],
      });
      source.set(reportPath, Buffer.from(report(head) + report(head, "fail")));
      await materialize(root, source);
      await git(root, ["add", "--all"]);
      expect(await run()).toMatchObject({ pass: true });
      const current = selectIdea(await readProject(root, "staged"), id);
      expect(deploymentReport(current.files).results.get("D-01")?.result).toBe(
        "fail",
      );
    });
  });
});
