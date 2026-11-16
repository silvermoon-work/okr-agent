// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../src/app.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("switches real and mock examples, with reference/schema failures surfaced to the reader", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App />);
  });
  expect(host.textContent).toContain("仅定义，未执行");
  expect(host.querySelector('[aria-label="按对象展开"]')).not.toBeNull();
  expect(host.textContent).toContain("共享定义");
  const shared = Array.from(host.querySelectorAll("nav button")).find(
    (item) => item.textContent === "共享检查配置",
  )!;
  act(() => {
    (shared as HTMLButtonElement).click();
  });
  expect(
    host.querySelector(".cbv-parents-table tbody")?.querySelectorAll("tr"),
  ).toHaveLength(4);
  expect(
    host.querySelector(".cbv-details .cbv-preconditions code")?.textContent,
  ).toBe("projectDirectory");
  expect(host.querySelector(".cbv-details h3")?.textContent).toBe(
    "共享检查配置",
  );
  const select = host.querySelector("select")!;
  for (const [value, expected] of [
    ["actual", "当前身份分流"],
    ["invalid-cycle", "无法展示此定义"],
    ["invalid", "无法展示此定义"],
    ["discussion", "识别项目"],
  ]) {
    act(() => {
      select.value = value!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain(expected);
    if (value === "invalid-cycle") {
      const error = host.querySelector('[role="alert"]');
      expect(error?.textContent).toContain("alpha → beta → alpha");
      expect(error?.textContent).toContain("/checkers/beta/children/0/checker");
      expect(host.querySelector("nav")).toBeNull();
    }
    if (value === "invalid") {
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "unknown-root",
      );
      expect(host.textContent).toContain("unknown-child");
      expect(host.textContent).toContain("无效的参数 JSON Schema");
    }
  }
  act(() => {
    root.unmount();
  });
});

it("mounts the actual browser entry in the local host", async () => {
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);
  await act(async () => {
    await import("../src/main.js");
  });
  expect(host.querySelector("h1")?.textContent).toBe("Check 定义工作台");
  expect(host.querySelector("nav")).not.toBeNull();
});
