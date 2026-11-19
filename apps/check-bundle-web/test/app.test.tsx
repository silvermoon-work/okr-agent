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

it("switches ordered real and mock examples, with duplicate, schema and old-format errors surfaced", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App />);
  });
  expect(host.textContent).toContain("仅定义，未执行");
  expect(host.querySelectorAll("nav ol")).toHaveLength(1);
  const select = host.querySelector("select")!;
  for (const [value, expected] of [
    ["typescript-design", "有序工程检查设计（未实现）"],
    ["actual", "身份与 workspace 配置"],
    ["invalid-duplicate", "无法展示此定义"],
    ["invalid", "无法展示此定义"],
    ["invalid-version", "无法展示此定义"],
    ["discussion", "识别项目"],
  ]) {
    act(() => {
      select.value = value!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain(expected);
    if (value === "typescript-design") {
      const scripts = Array.from(
        host.querySelectorAll<HTMLButtonElement>("nav button"),
      ).find(
        (item) => item.textContent === "根 Scripts · 固定 Turbo 聚合接口",
      )!;
      act(() => {
        scripts.click();
      });
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "workspace-script-unexpected",
      );
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "turbo run",
      );
      expect(host.textContent).toContain("@vitest/coverage-v8 工具声明");
      expect(host.querySelector("nav ol ol, nav ul")).toBeNull();
    }
    if (value === "actual") {
      const workspace = Array.from(
        host.querySelectorAll<HTMLButtonElement>("nav button"),
      ).find((item) => item.textContent === "Workspace 配置")!;
      act(() => {
        workspace.click();
      });
      expect(host.querySelector(".cbv-details h3")?.textContent).toBe(
        "Workspace 配置",
      );
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "workspace-configuration-invalid",
      );
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "packages",
      );
    }
    if (value === "invalid-duplicate") {
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "/checkpoints/1/id",
      );
      expect(host.querySelector("nav")).toBeNull();
    }
    if (value === "invalid") {
      expect(host.textContent).toContain("/checkpoints/0/rules/1/code");
      expect(host.textContent).toContain("无效的参数 JSON Schema");
    }
    if (value === "invalid-version")
      expect(host.textContent).toContain("仅支持当前 Spec v1 有序检查点格式");
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
