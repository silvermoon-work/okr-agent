import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

export class DeliverablesError extends Error {
  constructor(status, message) {
    super(`silvermoon.yaml: ${message}`);
    this.status = status;
  }
}
function requireValue(condition, status, message) {
  if (!condition) throw new DeliverablesError(status, message);
}
export const legacyDeliveryPaths = [
  "scripts/lib/release-packages.mjs",
  "scripts/release-packages.js",
  "release.config.json",
];
export function parseDeliverables(source) {
  if (source === undefined) return [];
  const document = parseDocument(source, { uniqueKeys: true });
  requireValue(
    !document.errors.length && !document.warnings.length,
    "mismatch",
    "invalid or unsupported YAML",
  );
  let value;
  try {
    value = document.toJS({ maxAliasCount: 32 });
  } catch {
    throw new DeliverablesError(
      "unconfirmed",
      "YAML alias budget or data conversion is unsupported",
    );
  }
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    "mismatch",
    "expected an object",
  );
  requireValue(
    Object.keys(value).every((key) => key === "deliverables"),
    "mismatch",
    "only deliverables is supported at the root",
  );
  requireValue(
    Object.hasOwn(value, "deliverables"),
    "missing",
    "deliverables is required",
  );
  requireValue(
    Array.isArray(value.deliverables),
    "mismatch",
    "deliverables must be a list",
  );
  const paths = new Set();
  const ids = new Set();
  return value.deliverables.map((item) => {
    requireValue(
      item && typeof item === "object" && !Array.isArray(item),
      "mismatch",
      "each deliverable must be an object",
    );
    for (const field of ["path", "type"])
      requireValue(
        Object.hasOwn(item, field),
        "missing",
        `${field} is required`,
      );
    requireValue(
      typeof item.path === "string" &&
        (item.path === "." ||
          (!/[:\\*?[\]{}<>|]/.test(item.path) &&
            ![...item.path].some((character) => character.charCodeAt(0) < 32) &&
            item.path
              .split("/")
              .every((part) => part && part !== "." && part !== ".."))),
      "mismatch",
      "path must be an explicit root-relative directory",
    );
    requireValue(
      !paths.has(item.path),
      "mismatch",
      `duplicate path ${item.path}`,
    );
    paths.add(item.path);
    requireValue(
      typeof item.type === "string" &&
        /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.type),
      "mismatch",
      `invalid type for ${item.path}`,
    );
    if (item.type === "npm") {
      requireValue(
        Object.hasOwn(item, "packageId"),
        "missing",
        `${item.path}: npm packageId is required`,
      );
      requireValue(
        typeof item.packageId === "string" &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.packageId),
        "mismatch",
        `${item.path}: invalid npm packageId`,
      );
      requireValue(
        !ids.has(item.packageId),
        "mismatch",
        `duplicate npm packageId ${item.packageId}`,
      );
      ids.add(item.packageId);
    }
    return item;
  });
}
export function validateDeliveryPaths(root, entries) {
  for (const entry of entries) {
    let path = resolve(root);
    for (const part of [
      "",
      ...(entry.path === "." ? [] : entry.path.split("/")),
    ]) {
      path = resolve(path, part);
      let info;
      try {
        info = lstatSync(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        throw new DeliverablesError(
          "missing",
          `${entry.path}: directory unavailable`,
        );
      }
      requireValue(
        !info.isSymbolicLink() && realpathSync(path) === path,
        "unconfirmed",
        `${entry.path}: redirected paths are not followed`,
      );
      requireValue(
        info.isDirectory(),
        "mismatch",
        `${entry.path}: expected an existing directory`,
      );
    }
  }
}
export function npmMappings(entries, projects) {
  return entries
    .filter((entry) => entry.type === "npm")
    .map((entry) => {
      const matches = projects.filter(
        (project) => (project.directory || ".") === entry.path,
      );
      requireValue(
        matches.length === 1,
        "mismatch",
        `${entry.path}: npm target must match one declared package`,
      );
      const manifest = matches[0].manifest;
      requireValue(
        manifest.private !== true,
        "mismatch",
        `${entry.path}: private npm target is forbidden`,
      );
      requireValue(
        typeof manifest.name === "string",
        "missing",
        `${entry.path}: npm manifest name is required`,
      );
      return {
        id: entry.packageId,
        name: manifest.name,
        directory: entry.path,
      };
    });
}
export function loadDeliverables(root) {
  for (const path of legacyDeliveryPaths)
    requireValue(
      !existsSync(resolve(root, path)),
      "mismatch",
      `legacy delivery source conflicts with the new standard: ${path}`,
    );
  const file = resolve(root, "silvermoon.yaml");
  let source;
  try {
    const info = lstatSync(file);
    requireValue(
      info.isFile() && !info.isSymbolicLink() && realpathSync(file) === file,
      "unconfirmed",
      "expected a regular non-redirected file",
    );
    requireValue(info.size <= 1_048_576, "unconfirmed", "file exceeds 1MiB");
    source = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const entries = parseDeliverables(source);
  validateDeliveryPaths(root, entries);
  return entries;
}
