import { useEffect, useRef, useState } from "react";
import type { CheckBundleSpec } from "./spec.js";

const protocol = "ipfsaw-navigation/v1";

export function useCheckpointNavigation(
  spec: CheckBundleSpec,
  enabled: boolean,
) {
  const [selected, setSelected] = useState<string | null>(null);
  const hash = useRef("");
  const write = (checkpoint: string | null, replace: boolean) => {
    const parameters = new URLSearchParams(hash.current.slice(1));
    if (checkpoint === null) parameters.delete("checkpoint");
    else parameters.set("checkpoint", checkpoint);
    const next = parameters.size ? `#${parameters.toString()}` : "";
    if (next.length > 4096) return;
    hash.current = next;
    if (window.parent !== window) {
      window.parent.postMessage(
        { protocol, type: "navigate", hash: next, replace },
        window.location.origin,
      );
    } else if (next !== window.location.hash) {
      const url = `${window.location.pathname}${window.location.search}${next}`;
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
  };
  useEffect(() => {
    if (!enabled) return;
    const restore = (value: string) => {
      hash.current = value;
      const requested = new URLSearchParams(value.slice(1)).get("checkpoint");
      const checkpoint =
        requested !== null &&
        spec.checkpoints.some(({ id }) => id === requested)
          ? requested
          : null;
      setSelected(checkpoint);
      if (requested !== checkpoint) write(checkpoint, true);
    };
    if (window.parent !== window) {
      const receive = (event: MessageEvent<unknown>) => {
        const data = event.data as Record<string, unknown> | null;
        if (
          event.source === window.parent &&
          event.origin === window.location.origin &&
          data?.protocol === protocol &&
          data.type === "state" &&
          typeof data.hash === "string"
        )
          restore(data.hash);
      };
      window.addEventListener("message", receive);
      window.parent.postMessage(
        { protocol, type: "ready" },
        window.location.origin,
      );
      return () => {
        window.removeEventListener("message", receive);
      };
    }
    const change = () => {
      restore(window.location.hash);
    };
    change();
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, [spec, enabled]);
  return {
    selected,
    select: (checkpoint: string | null) => {
      setSelected(checkpoint);
      if (enabled) write(checkpoint, false);
    },
  };
}
