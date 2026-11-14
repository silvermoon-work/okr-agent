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
export interface DeliverableDeclaration {
  entries: Deliverable[];
  /** Delivery-derived checks have no trustworthy target selection. */
  blocked: boolean;
}
export async function projectDeliverables(
  files: Files,
  projects: Project[],
  report: Report,
): Promise<Deliverable[]> {
  return (await deliverableDeclaration(files, projects, report)).entries;
}
export async function deliverableDeclaration(
  files: Files,
  projects: Project[],
  report: Report,
): Promise<DeliverableDeclaration> {
  for (const project of projects) delete project.delivery;
  for (const path of legacyDeliveryPaths)
    if (files.exists(path))
      report(
        "mismatch",
        `${path}: 旧交付来源须迁移到 silvermoon.yaml；不回退或并行选择`,
      );
  try {
    const declared = await files.optionalText("silvermoon.yaml");
    const entries = parseDeliverables(declared);
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
    const signs: string[] = [];
    for (const project of projects)
      for (const name of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
        const path = files.path(project.directory, name);
        if (files.exists(path)) signs.push(path);
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
        if (!Array.isArray(job.steps)) continue;
        for (const rawStep of job.steps as unknown[]) {
          const step = record(rawStep);
          if (typeof step.run !== "string") continue;
          const commands = step.run
            .split(/\r?\n|&&|;/)
            .map((command) => command.trim());
          const release = commands.some((command) =>
            /^pnpm\s+(?:run\s+)?release(?:-dry-run)?(?:\s|$)/.test(command),
          );
          const publish = commands.some((command) =>
            /^(?:npm|pnpm)\s+(?:(?:-r|--recursive)\s+)?publish(?:\s|$)/.test(
              command,
            ),
          );
          if (release || publish) signs.push(`${path}:${name}`);
          // A direct publish is always a release-domain violation; its
          // directory is irrelevant until it uses the fixed release entry.
          if (!release || declared === undefined) continue;
          if (!entries.some((entry) => entry.type === "npm")) {
            report(
              "missing",
              `${path}:${name}: 明确 npm 发布入口缺少 silvermoon.yaml npm 交付声明`,
            );
            continue;
          }
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
      }
    }
    if (declared === undefined && signs.length) {
      report(
        "missing",
        `silvermoon.yaml: 未声明 deliverables，但观察到交付迹象 ${[...new Set(signs)].join(", ")}；先声明每个交付单元（npm 包或 cloudflare 部署单元，不交付则写 deliverables: []），之后才检查发布工作流、npm 交付元数据和平台配置`,
      );
      return { entries, blocked: true };
    }
    return { entries, blocked: false };
  } catch (error) {
    if (error instanceof DeliverablesError) report(error.status, error.message);
    else if (error instanceof Unconfirmed) report("unconfirmed", error.message);
    else throw error;
    return { entries: [], blocked: true };
  }
}
