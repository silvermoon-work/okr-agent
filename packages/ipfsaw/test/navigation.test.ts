// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { previewNavigation } from "../src/navigation.js";

const protocol = "ipfsaw-navigation/v1";
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

it("keeps app fragments in first-party history and rejects foreign, stale or non-fragment navigation", () => {
  history.replaceState(null, "", "/?preview=1#checker=leaf");
  document.body.innerHTML = '<main id="renderer"><iframe></iframe></main>';
  const frame = document.querySelector("iframe")!;
  const post = vi
    .spyOn(frame.contentWindow!, "postMessage")
    .mockImplementation(() => {});
  const listeners = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((name, listener) => {
    listeners.set(name, listener);
  });
  previewNavigation();
  const event = (name: string, value: unknown) => {
    const listener = listeners.get(name);
    if (typeof listener !== "function") throw new Error("Missing listener");
    listener(value as Event);
  };
  const send = (
    data: unknown,
    origin = "null",
    source: unknown = frame.contentWindow,
  ) => {
    event("message", { data, origin, source });
  };
  send({ protocol, type: "ready" }, "https://foreign.test");
  send({ protocol, type: "ready" }, "null", window);
  send(null);
  send({ protocol: "wrong", type: "ready" });
  expect(post).not.toHaveBeenCalled();
  send({ protocol, type: "ready" });
  expect(post).toHaveBeenLastCalledWith(
    { protocol, type: "state", hash: "#checker=leaf" },
    "*",
  );
  const initialLength = history.length;
  for (const hash of [
    "https://evil.test/",
    "//evil.test/",
    `#${"x".repeat(4096)}`,
    1,
  ]) {
    send({ protocol, type: "navigate", hash, replace: false });
  }
  send({ protocol, type: "navigate", hash: "#bad" });
  send({ protocol, type: "unknown", hash: "#bad", replace: false });
  expect(location.hash).toBe("#checker=leaf");
  expect(history.length).toBe(initialLength);
  send({ protocol, type: "navigate", hash: "#checker=other", replace: false });
  expect(location.pathname + location.search + location.hash).toBe(
    "/?preview=1#checker=other",
  );
  expect(history.length).toBe(initialLength + 1);
  send({ protocol, type: "navigate", hash: "#checker=other", replace: false });
  expect(history.length).toBe(initialLength + 1);
  send({ protocol, type: "navigate", hash: "#checker=root", replace: true });
  expect(history.length).toBe(initialLength + 1);
  expect(location.hash).toBe("#checker=root");
  history.replaceState(null, "", "#checker=leaf");
  event("popstate", {});
  event("hashchange", {});
  expect(post).toHaveBeenLastCalledWith(
    { protocol, type: "state", hash: "#checker=leaf" },
    "*",
  );
  frame.hidden = true;
  send({ protocol, type: "navigate", hash: "#stale", replace: false });
  const replacement = document.createElement("iframe");
  document.querySelector("main")!.append(replacement);
  send({ protocol, type: "navigate", hash: "#stale", replace: false });
  expect(location.hash).toBe("#checker=leaf");
  const replacementPost = vi
    .spyOn(replacement.contentWindow!, "postMessage")
    .mockImplementation(() => {});
  send(
    { protocol, type: "navigate", hash: "", replace: true },
    "null",
    replacement.contentWindow,
  );
  expect(location.hash).toBe("");
  expect(replacementPost).toHaveBeenCalledWith(
    { protocol, type: "state", hash: "" },
    "*",
  );
});
