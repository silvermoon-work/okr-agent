import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { newId } from "@silvermoon-work/task-engine";

export function enginePort(engine, caller, evidence, onStarted = () => {}) {
  return async (bundleCid, input, signal) => {
    signal.throwIfAborted();
    const requestId = newId();
    let taskId;
    let cancellationFailure;
    const cancel = () => {
      if (!taskId) return;
      try {
        engine.cancelTask(taskId, caller);
      } catch (error) {
        cancellationFailure = error;
      }
    };
    signal.addEventListener("abort", cancel, { once: true });
    const record = { bundleCid, requestId };
    evidence.push(record);
    let executionFailure;
    try {
      let response = await engine.submit(
        { requestId, bundle: bundleCid, input, timeoutMs: 30000 },
        caller,
      );
      const preparationDeadline = Date.now() + 60000;
      while (response.status === "preparing") {
        assert.ok(Date.now() < preparationDeadline, "Task preparation exceeded host budget");
        response = await engine.getRequestStatus(
          requestId,
          { waitMs: 1000 },
          caller,
        );
      }
      assert.equal(response.status, "accepted", JSON.stringify(response));
      taskId = response.taskId;
      record.taskId = taskId;
      if (signal.aborted) cancel();
      const startedDeadline = Date.now() + 35000;
      let task = engine.getTask(taskId, caller);
      while (!task.run && !task.canceled && task.stage === "initial") {
        assert.ok(Date.now() < startedDeadline, "Task did not start or terminate");
        await delay(10);
        task = engine.getTask(taskId, caller);
      }
      if (task.run) {
        record.runId = task.run.runId;
        record.observedStarted = true;
        await onStarted({ taskId, runId: task.run.runId, input });
      }
      await engine.waitForTaskRelease(taskId, caller);
      const finished = engine.getTask(taskId, caller);
      const run = finished.run
        ? engine.getRun(finished.run.runId, caller)
        : undefined;
      record.stage = finished.stage;
      record.canceled = finished.canceled;
      record.reclaimed = !run || Boolean(run.reclaimedAt);
      record.runStage = run?.stage;
      assert.ok(record.reclaimed, "Independent Task Run was not physically reclaimed");
      if (cancellationFailure) throw cancellationFailure;
      signal.throwIfAborted();
      assert.equal(finished.stage, "completed", JSON.stringify(finished));
      assert.ok(finished.output, "Completed Task has no authentic output envelope");
      record.outputCid = finished.output.cid;
      return finished.output;
    } catch (error) {
      executionFailure = error;
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      if (taskId && executionFailure) {
        try {
          engine.cancelTask(taskId, caller);
          await engine.waitForTaskRelease(taskId, caller);
          const task = engine.getTask(taskId, caller);
          const run = task.run ? engine.getRun(task.run.runId, caller) : undefined;
          record.canceled = task.canceled;
          record.reclaimed = !run || Boolean(run.reclaimedAt);
          assert.ok(record.reclaimed, "Task cleanup did not release the Run");
        } catch (cleanupError) {
          throw new AggregateError(
            [executionFailure, cleanupError],
            "Task execution and cleanup failed",
          );
        }
      }
    }
  };
}
