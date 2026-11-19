/** Serialized into the host page. Only the active opaque app may change its URL fragment. */
export function previewNavigation(): void {
  const protocol = "ipfsaw-navigation/v1";
  const frame = () =>
    document.querySelector<HTMLIFrameElement>(
      "#renderer > iframe:not([hidden])",
    );
  const sync = () => {
    frame()?.contentWindow?.postMessage(
      { protocol, type: "state", hash: location.hash },
      "*",
    );
  };
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as Record<string, unknown> | null;
    if (
      !frame() ||
      event.source !== frame()!.contentWindow ||
      event.origin !== "null" ||
      data?.protocol !== protocol
    )
      return;
    if (data.type === "ready") {
      sync();
      return;
    }
    if (
      data.type !== "navigate" ||
      typeof data.hash !== "string" ||
      data.hash.length > 4096 ||
      (data.hash !== "" && !data.hash.startsWith("#")) ||
      typeof data.replace !== "boolean"
    )
      return;
    const url = new URL(location.href);
    url.hash = data.hash;
    if (url.hash !== location.hash) {
      if (data.replace) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    }
    sync();
  });
  window.addEventListener("hashchange", sync);
  window.addEventListener("popstate", sync);
}
