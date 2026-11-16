// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckBundleViewer } from "../src/viewer.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import type { CheckBundleSpec } from "../src/spec.js";
import { graphSpec } from "./fixtures.js";
import { browser } from "./browser.js";

let host: HTMLDivElement;
let root: Root;
let platform: ReturnType<typeof browser>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  platform = browser();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});
function button(text: string, scope: ParentNode = host): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find(
    (item) =>
      item.textContent.trim() === text ||
      item.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
}
function click(text: string, scope?: ParentNode) {
  act(() => {
    button(text, scope).click();
  });
  platform.flush();
}
function render(spec: CheckBundleSpec = graphSpec()) {
  act(() => {
    root.render(<CheckBundleViewer spec={spec} />);
  });
}
function details() {
  return host.querySelector<HTMLElement>('[aria-label="Checker 详情"]')!;
}
function heading() {
  return details().querySelector("h3")!;
}
function headings() {
  return Array.from(details().querySelectorAll(":scope > section > h4")).map(
    (item) => item.textContent,
  );
}

describe("compact definition navigation", () => {
  it("uses a compact title-only hierarchy and reveals hidden shared definitions", () => {
    render();
    const nav = host.querySelector("nav")!;
    expect(nav.querySelector("code")).toBeNull();
    expect(nav.textContent).not.toContain("文档条件");
    expect(nav.querySelector('[aria-label="按对象展开"]')).not.toBeNull();
    click("折叠 左分支");
    const toggle = button("展开 左分支");
    expect(
      document.getElementById(toggle.getAttribute("aria-controls")!)?.hidden,
    ).toBe(true);
    click("展开 左分支");
    click("折叠 左分支");
    click("跳转到 共享节点 定义");
    expect(button("折叠 左分支").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(button("共享节点", nav));
    expect(heading().textContent).toBe("共享节点");
    expect(details().textContent).toContain("未声明语义前置假设");
    expect(details().textContent).toContain("此规则未声明问题");
    expect(headings()).toEqual(["Parameters", "Problems", "Parents"]);
    click("收起分支");
    click("左分支", details());
    expect(button("折叠 入口").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(heading());
  });

  it("derives every incoming edge, including repeated parent edges, and navigates to parents", () => {
    const spec = graphSpec();
    spec.checkers.right!.children.push({
      checker: "shared",
      when: "**第二条件**含 `mode`。",
      parameter: "构造 `alternate` 参数。",
      forEach: "逐个 `target` 展开。",
    });
    render(spec);
    click("共享节点");
    const table = details().querySelector('[aria-label="父节点展开关系"]')!;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table.querySelector("strong")?.textContent).toBe("第二条件");
    expect(table.textContent).toContain("逐个 target 展开");
    expect(table.textContent).toContain("alternate");
    expect(host.querySelector("select")).toBeNull();
    click("右分支", table);
    expect(heading().textContent).toBe("右分支");
    expect(document.activeElement).toBe(heading());
    expect(headings()).toEqual([
      "Parameters",
      "Problems",
      "Children",
      "Parents",
    ]);
    click("入口");
    expect(headings()).toEqual(["Parameters", "Problems", "Children"]);
    click("未引用定义");
    expect(headings()).toEqual(["Parameters", "Problems"]);
    expect(details().textContent).toContain("未声明本地规则");
  });

  it("renders current real root routing and omits Children for its genuine leaf", () => {
    render(typescriptProjectSpec);
    expect(details().textContent).toContain("typescript-project-invalid");
    const childSection = details().querySelectorAll(":scope > section")[2]!;
    click("单仓项目", childSection);
    expect(heading().textContent).toBe("单仓项目");
    expect(headings()).toEqual(["Parameters", "Problems", "Parents"]);
    expect(details().textContent).toContain("尚未实现进一步工程规则");
    expect(details().textContent).not.toContain("叶节点，无 children");
    expect(document.activeElement).toBe(heading());
    click(
      "识别项目",
      details().querySelector('[aria-label="父节点展开关系"]')!,
    );
    expect(heading().textContent).toBe("识别项目");
  });

  it("isolates tree IDs, selection and shared-reference focus across instances", () => {
    act(() => {
      root.render(
        <>
          <CheckBundleViewer spec={graphSpec()} />
          <CheckBundleViewer spec={graphSpec()} />
        </>,
      );
    });
    const instances = host.querySelectorAll<HTMLElement>(".cbv");
    const first = instances[0]!,
      second = instances[1]!;
    expect(button("折叠 入口", first).getAttribute("aria-controls")).not.toBe(
      button("折叠 入口", second).getAttribute("aria-controls"),
    );
    click("跳转到 共享节点 定义", second);
    expect(first.querySelector("h3")?.textContent).toBe("入口");
    expect(second.querySelector("h3")?.textContent).toBe("共享节点");
    expect(second.contains(document.activeElement)).toBe(true);
  });
});

describe("safe Markdown and parameter source", () => {
  it("renders real Markdown in every descriptive surface while keeping schema JSON literal", () => {
    const spec = graphSpec();
    spec.checkers.root!.description =
      "# **说明**\n\n两段中的 *强调* 和 `directory`。\n\n- 一个条目\n- 第二项\n\n```ts\nconst inert = 'text';\n```\n\n[安全链接](https://example.com)\n\n| 项 | 值 |\n| - | - |\n| A | B |";
    spec.checkers.root!.parameter.preconditions = [
      "`directory` **已经存在**。",
    ];
    spec.checkers.root!.rules[0]!.description = "规则 **分组**。";
    spec.checkers.root!.rules[0]!.problems[0]!.description =
      "**问题**含 `field`。";
    spec.checkers.root!.rules[0]!.problems[0]!.when = "当 `value` *缺失*。";
    spec.checkers.root!.children[0]!.when = "**条件**检查 `kind`。";
    spec.checkers.root!.children[0]!.parameter =
      '映射 `directory`。\n\n```json\n{ "directory": "value" }\n```';
    spec.checkers.root!.children[0]!.forEach = "每个 `member`。";
    render(spec);
    expect(details().querySelector("em")?.textContent).toBe("强调");
    expect(
      details().querySelector("pre code.language-ts")?.textContent,
    ).toContain("const inert");
    expect(
      details().querySelector('a[href="https://example.com"]'),
    ).not.toBeNull();
    expect(
      details().querySelector('[aria-label="Markdown 表格"] table'),
    ).not.toBeNull();
    const fields = details().querySelector('[aria-label="参数字段列表"]')!;
    expect(fields.querySelector("code")?.textContent).toBe("directory");
    expect(fields.querySelector("strong")?.textContent).toBe("目录");
    expect(fields.querySelector("td code")?.textContent).toBe("string");
    expect(
      details().querySelector(".cbv-preconditions code")?.textContent,
    ).toBe("directory");
    const problems = details().querySelector(".cbv-problems")!;
    expect(
      Array.from(problems.querySelectorAll("thead th")).map(
        (item) => item.textContent,
      ),
    ).toEqual(["问题码", "说明", "触发条件"]);
    expect(problems.querySelector("td strong")?.textContent).toBe("问题");
    expect(problems.querySelector("td code")?.textContent).toBe("field");
    expect(problems.textContent).toContain("缺失");
    expect(
      details().querySelector(".cbv-child code.language-json"),
    ).not.toBeNull();
    expect(details().querySelector(".cbv-child strong")?.textContent).toBe(
      "条件",
    );
    const schema = details().querySelector("details")!;
    expect(schema.open).toBe(false);
    expect(schema.querySelector("code")?.textContent).toContain("**目录**");
    expect(schema.querySelector("strong")).toBeNull();
    click("左分支", host.querySelector("nav")!);
    const parents = details().querySelector(".cbv-parents-table")!;
    expect(parents.querySelector("strong")?.textContent).toBe("条件");
    expect(parents.querySelector("code.language-json")).not.toBeNull();
    expect(parents.textContent).toContain("每个 member");
  });

  it("drops raw HTML and images, neutralizes unsafe links, and leaves titles plain", () => {
    const spec = graphSpec();
    spec.checkers.root!.title = "**纯文本标题**";
    spec.checkers.root!.description =
      "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert%281%29) [数据](data:text/html,test)\n\n![remote](https://example.com/tracking.png)\n\n`<b>literal</b>` 与 ${1+1}";
    render(spec);
    expect(heading().textContent).toBe("**纯文本标题**");
    expect(heading().querySelector("strong")).toBeNull();
    expect(details().querySelector("script, img, b")).toBeNull();
    for (const link of details().querySelectorAll("a"))
      expect(link.getAttribute("href")).not.toMatch(/^(javascript|data):/);
    expect(details().textContent).toContain("<b>literal</b>");
    expect(details().textContent).toContain("${1+1}");
  });

  it("does not invent fields from references or composition and handles untyped direct fields", () => {
    const spec = graphSpec();
    spec.checkers.root!.parameter.schema = {
      type: "object",
      $defs: {
        part: { type: "object", properties: { hidden: { type: "string" } } },
      },
      allOf: [{ $ref: "#/$defs/part" }],
    };
    render(spec);
    expect(details().querySelector('[aria-label="参数字段列表"]')).toBeNull();
    expect(details().textContent).toContain("此 Schema 未直接列出字段");
    spec.checkers.root!.parameter.schema = {
      type: "object",
      properties: {
        any: true,
        composed: { anyOf: [{ type: "string" }, { type: "number" }] },
      },
    };
    render(spec);
    const table = details().querySelector('[aria-label="参数字段列表"]')!;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table.textContent).toContain("见 Schema");
    expect(table.textContent).toContain("可选");
  });
});

describe("native mobile navigation pane", () => {
  it.each([
    [true, false],
    [false, true],
  ])(
    "synchronizes initial media %s to current %s when layout changes before subscription without an event",
    (initial, current) => {
      let queries = 0;
      vi.stubGlobal("matchMedia", () => ({
        matches: ++queries === 1 ? initial : current,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      render();
      expect(Boolean(host.querySelector("dialog"))).toBe(current);
      expect(Boolean(host.querySelector(".cbv-navigation-toggle"))).toBe(
        current,
      );
      expect(Boolean(host.querySelector("nav")?.closest("dialog"))).toBe(
        current,
      );
      expect(document.activeElement).toBe(document.body);
    },
  );
  it("opens only in a native modal; selection closes it, reveals the target and focuses details", () => {
    platform = browser(true);
    render();
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(host.querySelector(".cbv-layout nav")).toBeNull();
    button("检查脉络").focus();
    click("检查脉络");
    expect(platform.showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(button("入口", dialog));
    click("右分支", dialog);
    expect(dialog.open).toBe(false);
    expect(heading().textContent).toBe("右分支");
    expect(document.activeElement).toBe(heading());
    click("检查脉络");
    expect(document.activeElement).toBe(button("右分支", dialog));
    click("跳转到 共享节点 定义", dialog);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(heading());
    expect(heading().textContent).toBe("共享节点");
  });

  it("restores opener focus after close, Escape cancellation and backdrop dismissal", () => {
    platform = browser(true);
    render();
    const dialog = host.querySelector("dialog")!;
    click("检查脉络");
    act(() => {
      button("入口", dialog).click();
    });
    platform.flush();
    click("检查脉络");
    click("关闭检查脉络");
    expect(document.activeElement).toBe(button("检查脉络"));
    click("检查脉络");
    const keydown = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      dialog.dispatchEvent(keydown);
    });
    expect(keydown.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("检查脉络"));
    click("检查脉络");
    const escape = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("检查脉络"));
    click("检查脉络");
    act(() => {
      button("入口", dialog).parentElement!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(dialog.open).toBe(true);
    act(() => {
      dialog.click();
    });
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("检查脉络"));
  });

  it("cleans up modal state on resize while preserving selected and collapsed state", () => {
    render();
    click("右分支");
    click("折叠 左分支");
    button("右分支", host.querySelector("nav")!).focus();
    platform.resize(true);
    platform.flush();
    expect(document.activeElement).toBe(heading());
    click("检查脉络");
    const oldDialog = host.querySelector("dialog")!;
    platform.resize(false);
    platform.flush();
    expect(oldDialog.open).toBe(false);
    expect(host.querySelector("dialog")).toBeNull();
    expect(heading().textContent).toBe("右分支");
    expect(button("展开 左分支").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(
      button("右分支", host.querySelector("nav")!),
    );
    platform.resize(true);
    click("检查脉络");
    expect(host.querySelector("dialog")?.open).toBe(true);
    act(() => {
      root.render(<div>已卸载</div>);
    });
    expect(platform.close).toHaveBeenCalled();
    platform.resize(false);
    expect(host.textContent).toBe("已卸载");
  });
});

describe("invalid input and spec replacement", () => {
  it("rejects cyclic definitions without rendering normal navigation", () => {
    const spec = graphSpec();
    spec.checkers.shared!.children = [
      { checker: "root", when: "说明", parameter: "说明" },
    ];
    render(spec);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "root → left → shared → root",
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "/checkers/shared/children/0/checker",
    );
    expect(host.querySelector("nav")).toBeNull();
  });
  it("resets stale selection when the spec changes and displays missing references", () => {
    render();
    click("未引用定义");
    render(typescriptProjectSpec);
    expect(heading().textContent).toBe("识别项目");
    render({ ...typescriptProjectSpec, root: "missing" });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "/root",
    );
  });
});
