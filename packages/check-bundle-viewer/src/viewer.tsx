import { useEffect, useId, useRef, useState } from "react";
import { ContractDetails, TaskOverview } from "./details.js";
import { validateCheckBundleSpec } from "./spec.js";
import type { CheckBundleSpec } from "./spec.js";
import { useCheckpointNavigation } from "./navigation.js";

const mobileQuery = "(max-width: 650px)";

export function CheckBundleViewer({
  spec,
  navigation = false,
}: {
  spec: unknown;
  navigation?: boolean;
}) {
  const result = validateCheckBundleSpec(spec);
  if (!result.valid)
    return (
      <section
        className="cbv cbv-errors"
        role="alert"
        aria-label="Spec 校验错误"
      >
        <h2>无法展示此定义</h2>
        <p>
          仅支持当前 Spec v1
          有序检查点格式；修正以下结构问题后再载入。校验不会执行任何检查。
        </p>
        <ul>
          {result.issues.map((issue, index) => (
            <li key={index}>
              <code>{issue.path}</code>：{issue.message}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <Definition
      key={JSON.stringify(result.spec)}
      spec={result.spec}
      navigation={navigation}
    />
  );
}

function Definition({
  spec,
  navigation,
}: {
  spec: CheckBundleSpec;
  navigation: boolean;
}) {
  const prefix = useId();
  const { selected, select } = useCheckpointNavigation(spec, navigation);
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(mobileQuery).matches,
  );
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(30);
  const layout = useRef<HTMLDivElement>(null);
  const controls = useRef(new Map<string | null, HTMLButtonElement>());
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsPane = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationRoot = useRef<HTMLElement>(null);
  const checkpoint = spec.checkpoints.find(({ id }) => id === selected);

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
          else controls.current.get(selected)?.focus();
        });
    };
    media.addEventListener("change", change);
    if (media.matches !== mobile) change();
    return () => {
      media.removeEventListener("change", change);
      activeDialog?.close();
    };
  }, [selected, mobile]);

  const closeNavigation = () => {
    dialog.current?.close();
    setNavigationOpen(false);
    navigationToggle.current?.focus();
  };
  const navigate = (id: string | null) => {
    select(id);
    dialog.current?.close();
    setNavigationOpen(false);
    requestAnimationFrame(() => {
      const target = detailsHeading.current;
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
      if (detailsPane.current) detailsPane.current.scrollTop = 0;
    });
  };
  const sidebar = (
    <aside className="cbv-sidebar" aria-label="检查点" ref={navigationRoot}>
      <div className="cbv-list-toolbar">
        <strong id={`${prefix}-navigation-title`}>有序检查点</strong>
        {mobile && (
          <button
            type="button"
            className="cbv-quiet"
            aria-label="关闭检查点"
            onClick={closeNavigation}
          >
            关闭
          </button>
        )}
      </div>
      <button
        type="button"
        className="cbv-select cbv-overview"
        title="任务总览"
        aria-current={selected === null ? "page" : undefined}
        ref={(element) => {
          if (element) controls.current.set(null, element);
          else controls.current.delete(null);
        }}
        onClick={() => {
          navigate(null);
        }}
      >
        任务总览
      </button>
      <nav className="cbv-outline" aria-label="Checkpoint 顺序">
        <ol>
          {spec.checkpoints.map((item, index) => (
            <li
              key={item.id}
              className={`cbv-row${selected === item.id ? " cbv-row-selected" : ""}`}
            >
              <span className="cbv-order" aria-hidden="true">
                {index + 1}
              </span>
              <button
                type="button"
                id={`${prefix}-${item.id}`}
                className="cbv-select"
                title={item.title}
                aria-current={selected === item.id ? "step" : undefined}
                ref={(element) => {
                  if (element) controls.current.set(item.id, element);
                  else controls.current.delete(item.id);
                }}
                onClick={() => {
                  navigate(item.id);
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
  return (
    <section className="cbv" aria-label={`${spec.name} 定义视图`}>
      <header className="cbv-header">
        <div>
          <h2>{spec.name}</h2>
          <p className="cbv-caption">
            定义 v{spec.specVersion} / 按顺序检查，通过继续，不通过即停止
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
              requestAnimationFrame(() => {
                controls.current.get(selected)?.focus();
              });
            }}
          >
            检查点
          </button>
        )}
      </header>
      <div
        className="cbv-layout"
        ref={layout}
        style={{
          gridTemplateColumns: `minmax(180px, ${String(sidebarWidth)}fr) 6px minmax(240px, ${String(100 - sidebarWidth)}fr)`,
        }}
      >
        {!mobile && sidebar}
        {!mobile && (
          <div
            className="cbv-resizer"
            role="separator"
            tabIndex={0}
            aria-label="调整检查点宽度"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={sidebarWidth}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const bounds = layout.current!.getBoundingClientRect();
              setSidebarWidth(
                Math.min(
                  80,
                  Math.max(
                    20,
                    Math.round(
                      ((event.clientX - bounds.left) / bounds.width) * 100,
                    ),
                  ),
                ),
              );
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const widths: Readonly<Record<string, number>> = {
                ArrowLeft: sidebarWidth - 2,
                ArrowRight: sidebarWidth + 2,
                Home: 20,
                End: 80,
              };
              const next = widths[event.key];
              if (next === undefined) return;
              event.preventDefault();
              setSidebarWidth(Math.min(80, Math.max(20, next)));
            }}
          />
        )}
        <article
          className="cbv-details"
          aria-label={checkpoint ? "Checkpoint 详情" : "Task 总览"}
          ref={detailsPane}
        >
          <div className="cbv-identity">
            <h3 tabIndex={-1} ref={detailsHeading}>
              {checkpoint ? checkpoint.title : "任务总览"}
            </h3>
            {checkpoint && <code>{checkpoint.id}</code>}
          </div>
          {checkpoint ? (
            <ContractDetails checkpoint={checkpoint} />
          ) : (
            <TaskOverview
              description={spec.description}
              parameter={spec.parameter}
            />
          )}
          <p className="cbv-footnote">
            所有检查点共享 Check Task Target；任务检查范围与参数见任务总览。
            此处仅展示定义，不执行检查或说明表达式。
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
