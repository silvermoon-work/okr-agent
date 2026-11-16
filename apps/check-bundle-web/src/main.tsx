import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "@silvermoon-work/check-bundle-viewer/style.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(<App />);
