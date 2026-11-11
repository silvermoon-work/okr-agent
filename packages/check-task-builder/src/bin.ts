#!/usr/bin/env node
import { runCheckBuilderCli } from "./cli.js";

const controller = new AbortController();
let signalExitCode: 130 | 143 = 130;
const interrupt = () => {
  controller.abort();
};
const terminate = () => {
  signalExitCode = 143;
  controller.abort();
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", terminate);
try {
  process.exitCode = await runCheckBuilderCli(process.argv.slice(2), {
    signal: controller.signal,
    signalExitCode: () => signalExitCode,
  });
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
}
