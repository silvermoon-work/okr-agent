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
    ["typescript-design", "Monorepo 下一层设计（未实现）"],
    ["actual", "当前身份分流与 workspace 配置"],
    ["invalid-cycle", "无法展示此定义"],
    ["invalid", "无法展示此定义"],
    ["discussion", "识别项目"],
  ]) {
    act(() => {
      select.value = value!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain(expected);
    if (value === "typescript-design") {
      expect(host.querySelector('[aria-label="按对象展开"]')).not.toBeNull();
      expect(host.textContent).toContain("成员发现 · 设计候选");
      expect(host.textContent).toContain("单个 package · 职责边界");
      expect(host.textContent).toContain("全局工程配置 · 职责节点");
      expect(host.textContent).toContain("根 Scripts · 固定 Turbo 聚合接口");
      expect(host.textContent).toContain("Turbo · 内容检查待细化");
      expect(host.textContent).toContain("脚本所需工具 · 设计候选");
      expect(host.textContent).not.toContain("test-coverage 根聚合脚本");
      const scripts = Array.from(
        host.querySelectorAll<HTMLButtonElement>("nav button"),
      ).find((item) => item.textContent === "根 Scripts · 固定 Turbo 聚合接口");
      expect(scripts).toBeDefined();
      act(() => {
        scripts!.click();
      });
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "workspace-script-unexpected",
      );
      expect(host.querySelector(".cbv-details")?.textContent).toContain(
        "turbo run",
      );
      expect(host.textContent).toContain("@vitest/coverage-v8 工具声明");
    }
    if (value === "actual") {
      const workspace = Array.from(host.querySelectorAll("nav button")).find(
        (item) => item.textContent === "Workspace 配置",
      );
      expect(workspace).toBeDefined();
      act(() => {
        (workspace as HTMLButtonElement).click();
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
