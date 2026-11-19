/** First-party session owner. Serialized into the host page, never the app realm. */
export function taskHostClient(): void {
  const protocol = "ipfsaw-task/v1";
  const session = crypto.randomUUID();
  const status = document.querySelector<HTMLElement>("#status")!;
  const panel = document.querySelector<HTMLElement>("#renderer")!;
  let latest = 0;
  let frame: HTMLIFrameElement | undefined;
  let port: MessagePort | undefined;
  let state: Record<string, unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let pending = 0;
  let generation = 0;
  const request = async (
    operation: Record<string, unknown>,
    revision = latest,
  ): Promise<unknown> => {
    const response = await fetch("/call", {
      method: "POST",
      headers: {
        "X-IPFSAW-Client": "browser",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...operation, session, revision }),
      mode: "same-origin",
      cache: "no-store",
    });
    const result = (await response.json()) as {
      ok: boolean;
      data?: unknown;
      error?: { code: string };
    };
    if (!result.ok)
      throw Object.assign(new Error("Browser Task request failed."), {
        code: result.error?.code,
      });
    return result.data;
  };
  const reset = () => {
    generation++;
    clearTimeout(timer);
    port?.close();
    frame?.remove();
    frame = undefined;
    port = undefined;
    started = false;
  };
  const fail = (message: string) => {
    reset();
    panel.hidden = true;
    status.hidden = false;
    status.textContent = message;
    status.setAttribute("role", "alert");
  };
  const controlFailure = (
    message: string,
    revision: number,
    expectedGeneration: number,
    removePendingApp = false,
  ) => {
    console.error(`Revision ${String(revision)}: ${message}`);
    if (revision !== latest || expectedGeneration !== generation) return;
    if (removePendingApp) {
      reset();
      panel.hidden = true;
    }
    status.hidden = false;
    status.textContent = message;
    status.setAttribute("role", "alert");
  };
  const failWithCleanup = (message: string, revision: number) => {
    fail(message);
    const current = generation;
    void request({ operation: "fail" }, revision).catch(() => {
      controlFailure(
        `${message} Host cleanup could not be confirmed. Check the host connection.`,
        revision,
        current,
      );
    });
  };
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as Record<string, unknown> | null;
    if (
      !frame ||
      port ||
      event.source !== frame.contentWindow ||
      event.origin !== "null" ||
      data?.protocol !== protocol ||
      data.type !== "hello"
    )
      return;
    const currentFrame = frame;
    const revision = latest;
    const channel = new MessageChannel();
    const currentPort = channel.port1;
    port = currentPort;
    currentPort.onmessage = (reply: MessageEvent<unknown>) => {
      const message = reply.data as Record<string, unknown> | null;
      if (
        !message ||
        message.protocol !== protocol ||
        message.revision !== latest ||
        revision !== latest ||
        frame !== currentFrame
      )
        return;
      if (
        message.type === "request" &&
        typeof message.id === "number" &&
        typeof message.operation === "string"
      ) {
        if (
          pending >= 16 ||
          (pending >= 8 && message.operation !== "cancelContent")
        ) {
          failWithCleanup("Browser request capacity exceeded.", revision);
          return;
        }
        pending++;
        void request(message, revision)
          .then(
            (value) => {
              if (frame === currentFrame && revision === latest)
                currentPort.postMessage({
                  protocol,
                  type: "reply",
                  id: message.id,
                  value,
                });
            },
            (error: unknown) => {
              if (frame === currentFrame && revision === latest)
                currentPort.postMessage({
                  protocol,
                  type: "reply",
                  id: message.id,
                  error: {
                    code:
                      error instanceof Error && "code" in error
                        ? error.code
                        : "invalid_request",
                    message: "Browser Task request failed.",
                  },
                });
            },
          )
          .finally(() => {
            pending--;
          });
      } else if (message.type === "ready") {
        started = true;
        clearTimeout(timer);
        status.textContent = `Started revision ${String(revision)}`;
        status.setAttribute("role", "status");
        status.hidden = true;
      } else if (message.type === "error") {
        failWithCleanup(
          started
            ? "App failed after startup completed."
            : "Browser startup failed. Correct the document or Task.",
          revision,
        );
      }
    };
    frame.contentWindow!.postMessage({ protocol, type: "connect" }, "*", [
      channel.port2,
    ]);
    currentPort.postMessage({
      protocol,
      type: "start",
      revision,
      parameters: state?.parameters,
      cid: state?.cid,
      entry: state?.entry,
    });
  });
  const accept = (next: Record<string, unknown>) => {
    if (
      !Number.isSafeInteger(next.revision) ||
      (next.revision as number) < latest
    )
      return;
    if (next.type === "task" && next.revision === state?.revision) return;
    latest = next.revision as number;
    reset();
    panel.hidden = true;
    status.hidden = false;
    status.setAttribute("role", "status");
    if (next.type === "error") {
      fail(
        typeof next.message === "string" ? next.message : "Invalid document.",
      );
      return;
    }
    if (next.type === "loading") {
      status.textContent = "Loading document…";
      return;
    }
    if (
      next.type !== "task" ||
      typeof next.cid !== "string" ||
      next.entry !== "main.mjs"
    ) {
      fail("Invalid host update.");
      return;
    }
    state = next;
    status.textContent = `Launching revision ${String(latest)}…`;
    frame = document.createElement("iframe");
    frame.title = "Browser Task app";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.src = "/frame";
    // Reveal the containing layout before invoking author code; initial matchMedia must see the real viewport.
    panel.hidden = false;
    panel.append(frame);
    timer = setTimeout(() => {
      const revision = latest;
      const current = generation;
      void request({ operation: "cancel" }, revision)
        .then((cancelled) => {
          if (cancelled && latest === revision && generation === current)
            fail("Browser startup timed out.");
        })
        .catch(() => {
          controlFailure(
            "Browser startup connection failed. Host cancellation could not be confirmed.",
            revision,
            current,
            !started,
          );
        });
    }, 15000);
  };
  window.addEventListener("pagehide", reset, { once: true });
  void (async () => {
    try {
      const response = await fetch("/events", {
        headers: {
          "X-IPFSAW-Client": "browser",
          "X-IPFSAW-Session": session,
        },
        mode: "same-origin",
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
      fail("Host connection closed. Restart ipfsaw to reconnect.");
    }
  })();
}
