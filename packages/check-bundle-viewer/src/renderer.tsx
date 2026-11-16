import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { CheckBundleViewer } from "./viewer.js";
import "./style.css";

let root: Root | undefined;

export default {
  mount(container: HTMLElement, document: unknown) {
    root = createRoot(container);
    root.render(<CheckBundleViewer spec={document} />);
  },
  update(document: unknown) {
    if (!root) throw new Error("Check renderer is not mounted.");
    root.render(<CheckBundleViewer spec={document} />);
  },
  dispose() {
    root?.unmount();
    root = undefined;
  },
};
