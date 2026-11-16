/** Serialized into the first-party host page; no renderer code runs in this realm. */
export function hostClient(): void {
  const protocol = "ipfsaw-browser/v1";
  // Keep the capability in this origin-bound history entry, not a persistent credential store.
  const saved = history.state as {
    protocol?: unknown;
    origin?: unknown;
    capability?: unknown;
  } | null;
  const token =
    location.hash.slice(1) ||
    (saved?.protocol === protocol &&
    saved.origin === location.origin &&
    typeof saved.capability === "string"
      ? saved.capability
      : "");
  history.replaceState(
    { protocol, origin: location.origin, capability: token },
    "",
    "/",
  );
  const status = document.querySelector<HTMLElement>("#status")!;
  const panel = document.querySelector<HTMLElement>("#renderer")!;
  let latest = 0;
  let frame: HTMLIFrameElement | undefined;
  let port: MessagePort | undefined;
  let cid = "";
  let ready = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deliver: (() => void) | undefined;
  const retiring = new Set<() => void>();
  const reset = () => {
    clearTimeout(timer);
    const previousFrame = frame;
    const previousPort = port;
    if (previousFrame && previousPort) {
      previousFrame.hidden = true;
      const revision = latest;
      const finish = () => {
        clearTimeout(disposalTimer);
        previousPort.close();
        previousFrame.remove();
        retiring.delete(finish);
      };
      const disposalTimer = setTimeout(finish, 500);
      retiring.add(finish);
      previousPort.onmessage = (reply: MessageEvent<unknown>) => {
        const message = reply.data as Record<string, unknown> | null;
        if (
          message?.protocol === protocol &&
          message.type === "disposed" &&
          message.revision === revision
        )
          finish();
      };
      previousPort.postMessage({ protocol, type: "dispose", revision });
      if (retiring.size > 4) retiring.values().next().value!();
    } else {
      previousPort?.close();
      previousFrame?.remove();
    }
    frame = undefined;
    port = undefined;
    cid = "";
    ready = false;
    pending = false;
    deliver = undefined;
  };
  const fail = (message: string) => {
    reset();
    panel.hidden = true;
    status.textContent = message;
    status.setAttribute("role", "alert");
  };
  const deadline = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fail(
        "Renderer did not respond. Restart preview or choose a working renderer.",
      );
    }, 15000);
  };
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as Record<string, unknown> | null;
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== "null" ||
      !data ||
      data.protocol !== protocol ||
      data.type !== "hello" ||
      port
    )
      return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (reply: MessageEvent<unknown>) => {
      const message = reply.data as Record<string, unknown> | null;
      if (
        !message ||
        message.protocol !== protocol ||
        message.revision !== latest
      )
        return;
      if (message.type === "error") {
        fail(
          "Renderer failed for the current revision. Correct the document or select another renderer.",
        );
        return;
      }
      if (message.type !== "ready") return;
      clearTimeout(timer);
      ready = true;
      pending = false;
      panel.hidden = false;
      status.textContent = `Revision ${String(latest)}`;
      status.setAttribute("role", "status");
    };
    frame.contentWindow!.postMessage({ protocol, type: "connect" }, "*", [
      channel.port2,
    ]);
    deliver?.();
  });
  const accept = (state: Record<string, unknown>) => {
    if (
      !Number.isSafeInteger(state.revision) ||
      (state.revision as number) < latest
    )
      return;
    latest = state.revision as number;
    panel.hidden = true;
    if (state.type === "loading") {
      status.textContent = `Loading revision ${String(latest)}…`;
      if (pending) reset();
      return;
    }
    if (state.type === "error") {
      fail(
        typeof state.message === "string"
          ? state.message
          : "Document could not be loaded.",
      );
      return;
    }
    if (
      state.type !== "document" ||
      typeof state.cid !== "string" ||
      typeof state.schema !== "string"
    ) {
      fail("Invalid host update.");
      return;
    }
    if (cid !== state.cid || !ready || pending) {
      reset();
      cid = state.cid;
      frame = document.createElement("iframe");
      frame.title = "Document renderer";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.src = "/frame";
      panel.append(frame);
    }
    const type = ready ? "update" : "mount";
    pending = true;
    deliver = () => {
      port!.postMessage({
        protocol,
        type,
        revision: latest,
        schema: state.schema,
        document: state.document,
        cid: state.cid,
        manifest: state.manifest,
      });
    };
    if (port) deliver();
    deadline();
  };
  void (async () => {
    try {
      const response = await fetch("/events", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new Error();
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (event.startsWith("data: "))
            accept(JSON.parse(event.slice(6)) as Record<string, unknown>);
        }
      }
    } catch {
      fail("Preview connection closed. Restart ipfsaw to reconnect.");
    }
  })();
  window.addEventListener(
    "pagehide",
    () => {
      reset();
      for (const finish of retiring) finish();
    },
    { once: true },
  );
}

/** Runs only in an opaque sandbox iframe. The private port is its only data input. */
export function frameClient(hostOrigin: string): void {
  const protocol = "ipfsaw-browser/v1";
  interface Renderer {
    mount(
      container: HTMLElement,
      document: unknown,
      context: { schema: string; revision: number },
    ): void | Promise<void>;
    update(
      document: unknown,
      context: { schema: string; revision: number },
    ): void | Promise<void>;
    dispose(): void | Promise<void>;
  }
  let port: MessagePort | undefined;
  let renderer: Renderer | undefined;
  let latest = 0;
  let chain = Promise.resolve();
  const reportFailure = () => {
    port?.postMessage({ protocol, type: "error", revision: latest });
  };
  window.addEventListener("error", reportFailure);
  window.addEventListener("unhandledrejection", reportFailure);
  const connect = (event: MessageEvent<unknown>) => {
    const data = event.data as Record<string, unknown> | null;
    if (
      event.source !== parent ||
      event.origin !== hostOrigin ||
      !data ||
      data.protocol !== protocol ||
      data.type !== "connect" ||
      event.ports.length !== 1 ||
      port
    )
      return;
    port = event.ports[0]!;
    window.removeEventListener("message", connect);
    port.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as Record<string, unknown> | null;
      if (
        !message ||
        message.protocol !== protocol ||
        !Number.isSafeInteger(message.revision) ||
        (message.revision as number) < latest ||
        !["mount", "update", "dispose"].includes(String(message.type))
      )
        return;
      latest = message.revision as number;
      const revision = latest;
      chain = chain.then(async () => {
        if (revision !== latest) return;
        try {
          if (message.type === "dispose") {
            await renderer?.dispose();
            port!.postMessage({ protocol, type: "disposed", revision });
            port?.close();
            return;
          }
          if (
            typeof message.schema !== "string" ||
            typeof message.cid !== "string" ||
            !message.manifest ||
            typeof message.manifest !== "object"
          )
            throw new Error();
          const manifest = message.manifest as {
            entry: string;
            styles: string[];
          };
          const base = `${hostOrigin}/assets/${encodeURIComponent(message.cid)}/`;
          const context = { schema: message.schema, revision };
          if (message.type === "mount") {
            const module = (await import(base + manifest.entry)) as {
              default?: Renderer;
            };
            const candidate = module.default;
            if (
              !candidate ||
              typeof candidate.mount !== "function" ||
              typeof candidate.update !== "function" ||
              typeof candidate.dispose !== "function"
            )
              throw new Error();
            renderer = candidate;
            await Promise.all(
              manifest.styles.map(
                (path) =>
                  new Promise<void>((resolve, reject) => {
                    const style = document.createElement("link");
                    style.rel = "stylesheet";
                    style.crossOrigin = "anonymous";
                    style.href = base + path;
                    style.onload = () => {
                      resolve();
                    };
                    style.onerror = () => {
                      reject(new Error("Stylesheet could not load."));
                    };
                    document.head.append(style);
                  }),
              ),
            );
            if (revision !== latest) return;
            await renderer.mount(
              document.querySelector<HTMLElement>("#app")!,
              message.document,
              context,
            );
          } else {
            if (!renderer) throw new Error();
            await renderer.update(message.document, context);
          }
          if (revision === latest)
            port!.postMessage({ protocol, type: "ready", revision });
        } catch {
          if (revision === latest)
            port!.postMessage({ protocol, type: "error", revision });
        }
      });
    };
    port.start();
  };
  window.addEventListener("message", connect);
  parent.postMessage({ protocol, type: "hello" }, hostOrigin);
}
