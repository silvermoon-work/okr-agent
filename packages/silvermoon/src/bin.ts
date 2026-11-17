#!/usr/bin/env node
import { runCli } from "./cli.js";

const controller = new AbortController();
process.once("SIGINT", () => {
  controller.abort(new Error("Cancelled by SIGINT."));
});
process.once("SIGTERM", () => {
  controller.abort(new Error("Cancelled by SIGTERM."));
});
process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
  signal: controller.signal,
});
