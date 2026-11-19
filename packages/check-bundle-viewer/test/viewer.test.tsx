// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckBundleViewer } from "../src/viewer.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import { longSpec, orderedSpec } from "./fixtures.js";
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
  window.history.replaceState(null, "", "/");
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
function render(spec: unknown = orderedSpec(), navigation = false) {
  act(() => {
    root.render(<CheckBundleViewer spec={spec} navigation={navigation} />);
  });
}
function details() {
  return host.querySelector<HTMLElement>('[aria-label="Checkpoint 详情"]')!;
}
function heading() {
  return details().querySelector("h3")!;
}

describe("ordered checkpoint navigation", () => {
  it.each([false, true])(
    "renders a flat ordered list without a fake task checkpoint (mobile: %s)",
    (mobile) => {
      platform.resize(mobile);
      const spec = orderedSpec();
      const original = structuredClone(spec);
      render(spec);
      if (mobile) click("检查点");
      const nav = host.querySelector("nav")!;
      const list = nav.querySelector("ol")!;
      expect(list.children).toHaveLength(3);
      expect(
        Array.from(nav.querySelectorAll("button"), (item) => item.textContent),
      ).toEqual(["上下文", "脚本定义", "完成"]);
      expect(
        nav.querySelector("ol ol, ul, [aria-expanded], .cbv-reference"),
      ).toBeNull();
      expect(nav.textContent).not.toContain(spec.name);
      expect(nav.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
      expect(heading().textContent).toBe("上下文");
      click("完成", nav);
      expect(heading().textContent).toBe("完成");
      expect(document.activeElement).toBe(heading());
      expect(details().querySelector(".cbv-identity > code")!.textContent).toBe(
        "completion",
      );
      expect(
        Array.from(
          details().querySelectorAll(":scope > section > h4"),
          (item) => item.textContent,
        ),
      ).toEqual(["Parameters", "Rules"]);
      expect(details().textContent).toContain("所有检查点共享同一任务参数");
      expect(host.textContent).toContain("通过继续，不通过即停止");
      expect(spec).toEqual(original);
    },
  );

  it.each([false, true])(
    "preserves full long titles in a flat list and in selected details (mobile: %s)",
    (mobile) => {
      platform.resize(mobile);
      const spec = longSpec();
      render(spec);
      if (mobile) click("检查点");
      const nav = host.querySelector("nav")!;
      expect(nav.querySelectorAll("ol")).toHaveLength(1);
      for (const checkpoint of spec.checkpoints) {
        const select = button(checkpoint.title, nav);
        expect(select.textContent).toBe(checkpoint.title);
        expect(select.title).toBe(checkpoint.title);
        expect(select.parentElement!.parentElement).toBe(
          nav.querySelector("ol"),
        );
      }
      const last = spec.checkpoints.at(-1)!;
      click(last.title, nav);
      expect(heading().textContent).toBe(last.title);
      expect(document.activeElement).toBe(heading());
      if (mobile) expect(host.querySelector("dialog")!.open).toBe(false);
    },
  );

  it("isolates navigation IDs and selection across component instances", () => {
    act(() => {
      root.render(
        <>
          <CheckBundleViewer spec={orderedSpec()} />
          <CheckBundleViewer spec={orderedSpec()} />
        </>,
      );
    });
    const [first, second] = host.querySelectorAll<HTMLElement>(".cbv");
    expect(button("上下文", first).id).not.toBe(button("上下文", second).id);
    click("脚本定义", second);
    expect(first!.querySelector("h3")!.textContent).toBe("上下文");
    expect(second!.querySelector("h3")!.textContent).toBe("脚本定义");
    expect(second!.contains(document.activeElement)).toBe(true);
    expect(window.location.hash).toBe("");
  });

  it("resizes the sidebar by keyboard with bounded widths and no mobile handle", () => {
    render();
    const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
    const resize = (key: string) => {
      act(() => {
        handle.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
      });
    };
    resize("ArrowRight");
    expect(handle.getAttribute("aria-valuenow")).toBe("32");
    resize("ArrowLeft");
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
    resize("Home");
    resize("ArrowLeft");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    resize("End");
    resize("ArrowRight");
    resize("Escape");
    expect(handle.getAttribute("aria-valuenow")).toBe("80");
    expect(
      host.querySelector<HTMLElement>(".cbv-layout")!.style.gridTemplateColumns,
    ).toBe("minmax(180px, 80fr) 6px minmax(240px, 20fr)");
    platform.resize(true);
    expect(host.querySelector('[role="separator"]')).toBeNull();
    platform.resize(false);
    expect(
      host.querySelector('[role="separator"]')!.getAttribute("aria-valuenow"),
    ).toBe("80");
  });

  it("only drags the captured pointer and releases it after resizing", () => {
    render();
    const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
    let captured = false;
    Object.assign(handle, {
      setPointerCapture: () => {
        captured = true;
      },
      hasPointerCapture: () => captured,
      releasePointerCapture: () => {
        captured = false;
      },
    });
    vi.spyOn(
      host.querySelector(".cbv-layout")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(100, 0, 1000, 600));
    const pointer = (type: string, clientX = 600, button = 0) => {
      act(() => {
        handle.dispatchEvent(
          new MouseEvent(type, { bubbles: true, clientX, button }),
        );
      });
    };
    pointer("pointermove");
    pointer("pointerup");
    pointer("pointerdown", 600, 2);
    expect(captured).toBe(false);
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
    pointer("pointerdown");
    pointer("pointermove");
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
    pointer("pointermove", -100);
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    pointer("pointermove", 2000);
    expect(handle.getAttribute("aria-valuenow")).toBe("80");
    pointer("pointerup");
    expect(captured).toBe(false);
    pointer("pointermove");
    expect(handle.getAttribute("aria-valuenow")).toBe("80");
  });
});

describe("opt-in checkpoint URL navigation", () => {
  it("keeps oversized portable IDs readable without emitting an unbounded navigation fragment", () => {
    const spec = orderedSpec();
    spec.checkpoints[0]!.id = "a".repeat(4096);
    render(spec, true);
    expect(heading().textContent).toBe("上下文");
    expect(window.location.hash).toBe("");
    click("脚本定义");
    expect(window.location.hash).toBe("#checkpoint=scripts");
    click("上下文");
    expect(heading().textContent).toBe("上下文");
    expect(window.location.hash).toBe("#checkpoint=scripts");
  });

  it("restores selection across updates, reordering and remounts; deleted IDs fall back to the first checkpoint", () => {
    window.history.replaceState(null, "", "#other=kept&checkpoint=scripts");
    const spec = orderedSpec();
    render(spec, true);
    expect(heading().textContent).toBe("脚本定义");
    click("完成", host.querySelector("nav")!);
    expect(window.location.hash).toBe("#other=kept&checkpoint=completion");
    spec.checkpoints.reverse();
    spec.checkpoints[0]!.title = "更新后的完成";
    render(spec, true);
    expect(heading().textContent).toBe("更新后的完成");
    act(() => {
      root.render(null);
    });
    render(spec, true);
    expect(heading().textContent).toBe("更新后的完成");
    spec.checkpoints.shift();
    render(spec, true);
    expect(heading().textContent).toBe("脚本定义");
    expect(window.location.hash).toBe("#other=kept&checkpoint=scripts");
  });

  it("restores browser history without appending entries and replaces unknown IDs", () => {
    render(orderedSpec(), true);
    const length = window.history.length;
    act(() => {
      window.history.replaceState(null, "", "#checkpoint=completion");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(heading().textContent).toBe("完成");
    expect(button("完成").getAttribute("aria-current")).toBe("step");
    expect(window.history.length).toBe(length);
    act(() => {
      window.history.replaceState(null, "", "#checkpoint=__proto__");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(heading().textContent).toBe("上下文");
    expect(window.location.hash).toBe("#checkpoint=context");
  });

  it("accepts embedded navigation only from the parent origin without changing Task parameters", () => {
    const iframe = document.createElement("iframe");
    host.append(iframe);
    const parentWindow = iframe.contentWindow!;
    const post = vi
      .spyOn(parentWindow, "postMessage")
      .mockImplementation(() => {});
    vi.stubGlobal("parent", parentWindow);
    const spec = orderedSpec();
    const original = structuredClone(spec);
    render(spec, true);
    expect(post).toHaveBeenCalledWith(
      { protocol: "ipfsaw-navigation/v1", type: "ready" },
      window.location.origin,
    );
    const state = (
      hash: unknown,
      source: MessageEventSource = parentWindow,
      origin = window.location.origin,
      protocol = "ipfsaw-navigation/v1",
    ) => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            source,
            origin,
            data: { protocol, type: "state", hash },
          }),
        );
      });
    };
    state("#checkpoint=scripts", window);
    state("#checkpoint=scripts", parentWindow, "https://foreign.test");
    state("#checkpoint=scripts", parentWindow, window.location.origin, "wrong");
    state(1);
    expect(heading().textContent).toBe("上下文");
    state("#checkpoint=scripts");
    expect(heading().textContent).toBe("脚本定义");
    click("完成");
    expect(post).toHaveBeenLastCalledWith(
      {
        protocol: "ipfsaw-navigation/v1",
        type: "navigate",
        hash: "#checkpoint=completion",
        replace: false,
      },
      window.location.origin,
    );
    state("#checkpoint=missing");
    expect(heading().textContent).toBe("上下文");
    expect(post).toHaveBeenLastCalledWith(
      {
        protocol: "ipfsaw-navigation/v1",
        type: "navigate",
        hash: "#checkpoint=context",
        replace: true,
      },
      window.location.origin,
    );
    expect(window.location.hash).toBe("");
    expect(spec).toEqual(original);
  });
});

describe("safe Markdown and shared task parameters", () => {
  it("renders descriptive Markdown, plain rule codes and literal schema JSON", () => {
    const spec = orderedSpec();
    spec.checkpoints[0]!.description =
      "# **说明**\n\n两段中的 *强调* 和 `directory`。\n\n- 一个条目\n- 第二项\n\n```ts\nconst inert = 'text';\n```\n\n[安全链接](https://example.com)\n\n| 项 | 值 |\n| - | - |\n| A | B |";
    spec.parameter.preconditions = ["`directory` **已经存在**。"];
    spec.checkpoints[0]!.rules[0] = {
      code: "**plain-code**",
      description: "规则 **约束**含 `field`。",
    };
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
    expect(fields.textContent).toContain("必填");
    expect(
      details().querySelector(".cbv-preconditions code")?.textContent,
    ).toBe("directory");
    const rules = details().querySelector(".cbv-rules")!;
    expect(
      Array.from(
        rules.querySelectorAll("thead th"),
        (item) => item.textContent,
      ),
    ).toEqual(["规则码", "说明"]);
    expect(rules.querySelector("th code")?.textContent).toBe("**plain-code**");
    expect(rules.querySelector("th strong")).toBeNull();
    expect(rules.querySelector("td strong")?.textContent).toBe("约束");
    const schema = details().querySelector("details")!;
    expect(schema.open).toBe(false);
    expect(schema.querySelector("code")?.textContent).toContain("**目录**");
    expect(schema.querySelector("strong")).toBeNull();
    click("脚本定义");
    expect(
      details().querySelector('[aria-label="参数字段列表"]')?.textContent,
    ).toBe(fields.textContent);
  });

  it("drops raw HTML and images, neutralizes unsafe links, and leaves titles plain", () => {
    const spec = orderedSpec();
    spec.checkpoints[0]!.title = "**纯文本标题**";
    spec.checkpoints[0]!.description =
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

  it("does not invent fields from composition and handles untyped fields and absent assumptions", () => {
    const spec = orderedSpec();
    spec.parameter = {
      schema: {
        type: "object",
        $defs: {
          part: { type: "object", properties: { hidden: { type: "string" } } },
        },
        allOf: [{ $ref: "#/$defs/part" }],
      },
      preconditions: [],
    };
    render(spec);
    expect(details().querySelector('[aria-label="参数字段列表"]')).toBeNull();
    expect(details().textContent).toContain("此 Schema 未直接列出字段");
    expect(details().textContent).toContain("未声明语义前置假设");
    spec.parameter.schema = {
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
    expect(table.textContent).toContain("—");
  });
});

describe("native mobile navigation pane", () => {
  it.each([
    [true, false],
    [false, true],
  ])(
    "synchronizes initial media %s to current %s before subscription",
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

  it("opens a native modal; selection closes it and focuses details", () => {
    platform = browser(true);
    render();
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(host.querySelector(".cbv-layout nav")).toBeNull();
    button("检查点").focus();
    click("检查点");
    expect(platform.showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(button("上下文", dialog));
    click("脚本定义", dialog);
    expect(dialog.open).toBe(false);
    expect(heading().textContent).toBe("脚本定义");
    expect(document.activeElement).toBe(heading());
    click("检查点");
    expect(document.activeElement).toBe(button("脚本定义", dialog));
  });

  it("restores opener focus after close, Escape cancellation and backdrop dismissal", () => {
    platform = browser(true);
    render();
    const dialog = host.querySelector("dialog")!;
    click("检查点");
    click("关闭检查点");
    expect(document.activeElement).toBe(button("检查点"));
    click("检查点");
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
    expect(document.activeElement).toBe(button("检查点"));
    click("检查点");
    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(dialog.open).toBe(true);
    const escape = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("检查点"));
    click("检查点");
    act(() => {
      button("上下文", dialog).parentElement!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(dialog.open).toBe(true);
    act(() => {
      dialog.click();
    });
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("检查点"));
  });

  it("closes modals on resize or unmount while preserving selection and focus", () => {
    render();
    click("脚本定义");
    button("脚本定义", host.querySelector("nav")!).focus();
    platform.resize(true);
    platform.flush();
    expect(document.activeElement).toBe(heading());
    click("检查点");
    const oldDialog = host.querySelector("dialog")!;
    platform.resize(false);
    platform.flush();
    expect(oldDialog.open).toBe(false);
    expect(host.querySelector("dialog")).toBeNull();
    expect(heading().textContent).toBe("脚本定义");
    expect(document.activeElement).toBe(
      button("脚本定义", host.querySelector("nav")!),
    );
    platform.resize(true);
    click("检查点");
    act(() => {
      root.render(<div>已卸载</div>);
    });
    expect(platform.close).toHaveBeenCalled();
    platform.resize(false);
    expect(host.textContent).toBe("已卸载");
  });
});

describe("invalid input and spec replacement", () => {
  it("rejects duplicate IDs without rendering normal navigation", () => {
    const spec = orderedSpec();
    spec.checkpoints[1]!.id = spec.checkpoints[0]!.id;
    render(spec);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "/checkpoints/1/id",
    );
    expect(host.querySelector("nav")).toBeNull();
  });
  it("resets stale selection on replacement and explicitly rejects v1", () => {
    render();
    click("完成");
    render(typescriptProjectSpec);
    expect(heading().textContent).toBe("识别项目");
    render({ specVersion: "1.0", name: "旧文档", root: "entry", checkers: {} });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "仅支持 Spec v2",
    );
    expect(host.querySelector("nav")).toBeNull();
  });
});
