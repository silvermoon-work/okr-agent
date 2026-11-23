import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  CheckBundleViewer,
  validateCheckBundleSpec,
} from "@silvermoon-work/check-bundle-viewer";
import type { CheckBundleSpec } from "@silvermoon-work/check-bundle-viewer";
import type { TaskCallback } from "@silvermoon-work/task-sdk";

/** Explicit browser author entry, not the legacy renderer ABI. */
const start: TaskCallback<CheckBundleSpec, { started: true }> = async (
  parameters,
  context,
) => {
  context.signal.throwIfAborted();
  const validation = validateCheckBundleSpec(parameters);
  if (!validation.valid) throw new Error("Invalid Check definition.");
  const style = document.createElement("link");
  style.rel = "stylesheet";
  const entry = import.meta.url;
  style.href = new URL("resources/check.css", entry).href;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      style.onload = null;
      style.onerror = null;
      context.signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      style.remove();
      const reason: unknown = context.signal.reason;
      reject(
        reason instanceof Error
          ? reason
          : new DOMException("Startup cancelled.", "AbortError"),
      );
    };
    style.onload = () => {
      cleanup();
      resolve();
    };
    style.onerror = () => {
      cleanup();
      style.remove();
      reject(new Error("Check stylesheet failed to load."));
    };
    context.signal.addEventListener("abort", abort, { once: true });
    document.head.append(style);
  });
  context.signal.throwIfAborted();
  const container = document.createElement("main");
  container.id = "check-definition";
  container.className = "cbv-fill";
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      createElement(CheckBundleViewer, {
        spec: validation.spec,
        navigation: true,
      }),
    );
  });
  return { started: true };
};

export default start;
