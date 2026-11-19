import { useEffect, useId, useRef, useState } from "react";
import { ContractDetails } from "./details.js";
import { createOutline } from "./outline.js";
import type { OutlineNode } from "./outline.js";
import { validateCheckBundleSpec } from "./spec.js";
import type { CheckBundleSpec } from "./spec.js";

const mobileQuery = "(max-width: 650px)";

export function CheckBundleViewer({ spec }: { spec: unknown }) {
  const result = validateCheckBundleSpec(spec);
  if (!result.valid)
    return (
      <section
        className="cbv cbv-errors"
        role="alert"
        aria-label="Spec 校验错误"
      >
        <h2>无法展示此定义</h2>
        <p>修正以下结构或引用问题后再载入。校验不会执行任何检查。</p>
        <ul>
          {result.issues.map((issue, index) => (
            <li key={index}>
              <code>{issue.path}</code>：{issue.message}
            </li>
          ))}
        </ul>
      </section>
    );
  return <Definition key={JSON.stringify(result.spec)} spec={result.spec} />;
}

function Definition({ spec }: { spec: CheckBundleSpec }) {
  const prefix = useId();
  const [outline] = useState(() => createOutline(spec));
  const [selected, setSelected] = useState(spec.root);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(mobileQuery).matches,
  );
  const [navigationOpen, setNavigationOpen] = useState(false);
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsPane = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationRoot = useRef<HTMLElement>(null);
  const locations = new Map<string, { id: string; ancestors: string[] }>();
  const collect = (nodes: OutlineNode[], ancestors: string[]) => {
    for (const node of nodes) {
      if (!node.reference) {
        locations.set(node.checker, { id: node.id, ancestors });
        collect(node.children, [...ancestors, node.id]);
      }
    }
  };
  collect(outline, []);
  const selectedLocation = locations.get(selected)!;

  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const activeDialog = dialog.current;
    const change = () => {
      const wasOpen = dialog.current?.open;
      const hadNavigationFocus = navigationRoot.current?.contains(
        document.activeElement,
      );
      dialog.current?.close();
      setNavigationOpen(false);
      setMobile(media.matches);
      if (wasOpen || hadNavigationFocus)
        requestAnimationFrame(() => {
          if (media.matches) detailsHeading.current?.focus();
          else controls.current.get(selectedLocation.id)?.focus();
        });
    };
    media.addEventListener("change", change);
    if (media.matches !== mobile) change();
    return () => {
      media.removeEventListener("change", change);
      activeDialog?.close();
    };
  }, [selectedLocation.id, mobile]);

  const closeNavigation = () => {
    dialog.current?.close();
    setNavigationOpen(false);
    navigationToggle.current?.focus();
  };
  const navigate = (name: string, focusTree = false) => {
    const location = locations.get(name)!;
    setSelected(name);
    setCollapsed(
      new Set([...collapsed].filter((id) => !location.ancestors.includes(id))),
    );
    dialog.current?.close();
    setNavigationOpen(false);
    requestAnimationFrame(() => {
      const target =
        focusTree && !mobile
          ? controls.current.get(location.id)
          : detailsHeading.current;
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
      if (detailsPane.current) detailsPane.current.scrollTop = 0;
    });
  };
  const renderNode = (node: OutlineNode, depth: number) => {
    const definition = spec.checkers[node.checker]!;
    const closed = collapsed.has(node.id);
    return (
      <li key={node.id}>
        {node.detached && !node.edge && (
          <p className="cbv-detached">未从入口引用</p>
        )}
        <div
          className={`cbv-row${selectedLocation.id === node.id ? " cbv-row-selected" : ""}`}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              className="cbv-toggle"
              aria-expanded={!closed}
              aria-controls={`${prefix}-${node.id}-children`}
              aria-label={`${closed ? "展开" : "折叠"} ${definition.title}`}
              onClick={() => {
                const next = new Set(collapsed);
                if (closed) next.delete(node.id);
                else next.add(node.id);
                setCollapsed(next);
              }}
            >
              {closed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="cbv-spacer" />
          )}
          {depth >= 7 && (
            <span
              className="cbv-depth"
              title={`第 ${String(depth + 1)} 层`}
              aria-label={`第 ${String(depth + 1)} 层`}
            >
              {depth + 1}
            </span>
          )}
          <button
            type="button"
            id={`${prefix}-${node.id}`}
            className="cbv-select"
            title={definition.title}
            aria-current={selectedLocation.id === node.id ? "true" : undefined}
            ref={(element) => {
              if (element) controls.current.set(node.id, element);
              else controls.current.delete(node.id);
            }}
            onClick={() => {
              navigate(node.checker);
            }}
          >
            {definition.title}
          </button>
          {node.edge && node.id.split("-").length === 2 && (
            <span className="cbv-tag">分支</span>
          )}
          {node.edge?.forEach && (
            <span className="cbv-tag" aria-label="按对象展开">
              × N
            </span>
          )}
          {node.reference && (
            <button
              type="button"
              className="cbv-reference"
              aria-label={`跳转到 ${definition.title} 定义`}
              onClick={() => {
                navigate(node.checker, true);
              }}
            >
              ↗
            </button>
          )}
        </div>
        {node.children.length > 0 && (
          <ul id={`${prefix}-${node.id}-children`} hidden={closed}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  const sidebar = (
    <aside className="cbv-sidebar" aria-label="检查脉络" ref={navigationRoot}>
      <div className="cbv-tree-toolbar">
        <strong id={`${prefix}-navigation-title`}>检查脉络</strong>
        <button
          type="button"
          className="cbv-quiet"
          onClick={() => {
            setCollapsed(new Set([...locations.values()].map(({ id }) => id)));
          }}
        >
          收起分支
        </button>
        {mobile && (
          <button
            type="button"
            className="cbv-quiet"
            aria-label="关闭检查脉络"
            onClick={closeNavigation}
          >
            关闭
          </button>
        )}
      </div>
      <nav className="cbv-outline" aria-label="Checker 定义脉络">
        <ul>{outline.map((node) => renderNode(node, 0))}</ul>
      </nav>
      <div className="cbv-tree-legend">
        <span>× N 按对象展开</span>
        <span>↗ 共享定义</span>
        <span>DAG · 无环</span>
      </div>
    </aside>
  );
  return (
    <section className="cbv" aria-label={`${spec.name} 定义视图`}>
      <header className="cbv-header">
        <div>
          <h2>{spec.name}</h2>
          <p className="cbv-caption">
            定义 v{spec.specVersion} / 同级不代表固定执行顺序
          </p>
        </div>
        <span className="cbv-label">仅定义，未执行</span>
        {mobile && (
          <button
            type="button"
            className="cbv-navigation-toggle"
            ref={navigationToggle}
            aria-haspopup="dialog"
            aria-controls={`${prefix}-navigation`}
            aria-expanded={navigationOpen}
            onClick={() => {
              dialog.current!.showModal();
              setNavigationOpen(true);
              setCollapsed(
                new Set(
                  [...collapsed].filter(
                    (id) => !selectedLocation.ancestors.includes(id),
                  ),
                ),
              );
              requestAnimationFrame(() => {
                controls.current.get(selectedLocation.id)?.focus();
              });
            }}
          >
            检查脉络
          </button>
        )}
      </header>
      <div className="cbv-layout">
        {!mobile && sidebar}
        <article
          className="cbv-details"
          aria-label="Checker 详情"
          ref={detailsPane}
        >
          <div className="cbv-identity">
            <h3 tabIndex={-1} ref={detailsHeading}>
              {spec.checkers[selected]!.title}
            </h3>
            <code>{selected}</code>
            {selected === spec.root && (
              <span className="cbv-caption">入口 checker</span>
            )}
          </div>
          <ContractDetails
            spec={spec}
            selected={selected}
            navigate={navigate}
          />
          <p className="cbv-footnote">
            Schema
            合法不等于语义前置条件成立。根节点由调用方保证；父节点代码先检验子节点声明的前置条件，再构造参数。文档表达式不求值。
          </p>
        </article>
      </div>
      {mobile && (
        <dialog
          className="cbv-navigation"
          id={`${prefix}-navigation`}
          ref={dialog}
          aria-labelledby={`${prefix}-navigation-title`}
          aria-modal="true"
          onKeyDown={(event) => {
            // Embedded hosts may deliver Escape without a native cancel event.
            if (event.key === "Escape") {
              event.preventDefault();
              closeNavigation();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeNavigation();
          }}
          onClose={() => {
            setNavigationOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNavigation();
          }}
        >
          {sidebar}
        </dialog>
      )}
    </section>
  );
}
