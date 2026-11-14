import type { Project } from "./commands.js";
import { type Files, Unconfirmed, dataYaml, record } from "./files.js";
import {
  DeliverablesError,
  legacyDeliveryPaths,
  parseDeliverables,
  validateDeliveryPaths,
  type Deliverable,
} from "../assets/deliverables.mjs";

type Report = (
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;
export async function projectDeliverables(
  files: Files,
  projects: Project[],
  report: Report,
): Promise<Deliverable[]> {
  for (const project of projects) delete project.delivery;
  for (const path of legacyDeliveryPaths)
    if (files.exists(path))
      report(
        "mismatch",
        `${path}: 旧交付来源须迁移到 silvermoon.yaml；不回退或并行选择`,
      );
  try {
    const source = await files.optionalText("silvermoon.yaml");
    const entries = parseDeliverables(source);
    validateDeliveryPaths(files.root, entries);
    for (const entry of entries) {
      const project = projects.find(
        (project) => (project.directory || ".") === entry.path,
      );
      if (project) project.delivery = entry.type;
      else if (entry.type === "npm" || entry.type === "cloudflare")
        report(
          "mismatch",
          `silvermoon.yaml: ${entry.path}: ${entry.type} 交付项必须精确匹配根包或工作区成员`,
        );
    }
    for (const path of files.paths.filter((path) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
    )) {
      const source = await files.text(path);
      if (
        !/\b(?:npm|pnpm)\s+(?:(?:-r|--recursive|run)\s+)?(?:publish|release(?:-dry-run)?)\b/.test(
          source,
        )
      )
        continue;
      const workflow = dataYaml(source);
      for (const [name, raw] of Object.entries(record(workflow.jobs ?? {}))) {
        const job = record(raw);
        const defaults = {
          ...record(record(workflow.defaults ?? {}).run ?? {}),
          ...record(record(job.defaults ?? {}).run ?? {}),
        };
        if (!Array.isArray(job.steps)) continue;
        for (const rawStep of job.steps as unknown[]) {
          const step = record(rawStep);
          if (typeof step.run !== "string") continue;
          const commands = step.run
            .split(/\r?\n|&&|;/)
            .map((command) => command.trim());
          if (
            commands.some((command) =>
              /^pnpm\s+(?:run\s+)?release(?:-dry-run)?(?:\s|$)/.test(command),
            )
          ) {
            if (!entries.some((entry) => entry.type === "npm"))
              report(
                "missing",
                `${path}:${name}: 明确 npm 发布入口缺少 silvermoon.yaml npm 交付声明`,
              );
            const selected = {
              ...record(workflow.env ?? {}),
              ...record(job.env ?? {}),
              ...record(step.env ?? {}),
            }.PACKAGE_INPUT;
            if (
              typeof selected === "string" &&
              !selected.includes("${{") &&
              !entries.some(
                (entry) => entry.type === "npm" && entry.packageId === selected,
              )
            )
              report(
                "missing",
                `${path}:${name}: 发布选择 ${selected} 未登记 npm 交付声明`,
              );
          }
          if (
            commands.some((command) =>
              /^(?:npm|pnpm)\s+(?:(?:-r|--recursive)\s+)?publish(?:\s|$)/.test(
                command,
              ),
            )
          ) {
            const directory =
              step["working-directory"] ?? defaults["working-directory"] ?? ".";
            if (
              typeof directory !== "string" ||
              directory.includes("${{") ||
              /(?:--dir|--prefix|-C|cd\s)/.test(step.run)
            )
              report("unconfirmed", `${path}:${name}: 发布目录无法静态确认`);
            else {
              const normalized = files.path("", directory) || ".";
              if (
                !entries.some(
                  (entry) => entry.type === "npm" && entry.path === normalized,
                )
              )
                report(
                  "missing",
                  `${path}:${name}: 发布目录 ${normalized} 未登记 npm 交付声明`,
                );
            }
          }
        }
      }
    }
    return entries;
  } catch (error) {
    if (error instanceof DeliverablesError) report(error.status, error.message);
    else if (error instanceof Unconfirmed) report("unconfirmed", error.message);
    else throw error;
    return [];
  }
}
