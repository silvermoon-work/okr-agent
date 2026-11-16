import { act } from "react";
import { vi } from "vitest";

export function browser(mobile = false) {
  let matches = mobile;
  const listeners = new Set<() => void>();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_event: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => {
      listeners.delete(listener);
    },
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (this.open) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: showModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: close,
  });
  return {
    showModal,
    close,
    flush: () => {
      act(() => {
        while (frames.length) frames.shift()!(0);
      });
    },
    resize: (next: boolean) => {
      act(() => {
        matches = next;
        for (const listener of [...listeners]) listener();
      });
    },
  };
}
