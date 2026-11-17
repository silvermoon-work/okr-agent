import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

export class DeliverablesError extends Error {
  constructor(status, message) {
    super(`deliverable.yaml: ${message}`);
    this.status = status;
  }
}
function requireValue(condition, status, message) {
  if (!condition) throw new DeliverablesError(status, message);
}
function canonicalDirectory(directory) {
  return (
    typeof directory === "string" &&
    (directory === "." ||
      (!/[:\\*?[\]{}<>|]/.test(directory) &&
        ![...directory].some((character) => character.charCodeAt(0) < 32) &&
        directory
          .split("/")
          .every((part) => part && part !== "." && part !== "..")))
  );
}
export const legacyDeliveryPaths = [
  "silvermoon.yaml",
  "scripts/lib/release-packages.mjs",
  "scripts/release-packages.js",
  "release.config.json",
];
export function parseDeliverables(source, directory = ".") {
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
    !["path", "packageId", "deliverables"].some((key) =>
      Object.hasOwn(value, key),
    ),
    "mismatch",
    "path, packageId and root deliverables are not supported; declare type in each package",
  );
  return [value].map((item) => {
    for (const field of ["type"])
      requireValue(
        Object.hasOwn(item, field),
        "missing",
        `${field} is required`,
      );
    requireValue(
      canonicalDirectory(directory),
      "mismatch",
      "path must be an explicit root-relative directory",
    );
    requireValue(
      typeof item.type === "string" &&
        /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.type),
      "mismatch",
      `invalid type for ${directory}`,
    );
    return { ...item, path: directory };
  });
}
export function validateDeliveryPaths(root, entries) {
  for (const entry of entries) {
    requireValue(
      canonicalDirectory(entry.path),
      "mismatch",
      "path must be an explicit root-relative directory",
    );
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
  const names = new Set();
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
        typeof manifest.name === "string" &&
          /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(
            manifest.name,
          ),
        "missing",
        `${entry.path}: valid npm manifest name is required`,
      );
      requireValue(
        !names.has(manifest.name),
        "mismatch",
        `duplicate npm package name ${manifest.name}`,
      );
      names.add(manifest.name);
      return {
        id: manifest.name,
        name: manifest.name,
        directory: entry.path,
      };
    });
}
export function loadDeliverables(root, directories = ["."]) {
  for (const path of legacyDeliveryPaths)
    requireValue(
      !existsSync(resolve(root, path)),
      "mismatch",
      `legacy delivery source conflicts with the new standard: ${path}`,
    );
  return [...new Set(directories.map((directory) => directory || "."))].flatMap(
    (directory) => {
      const file = resolve(root, directory, "deliverable.yaml");
      validateDeliveryPaths(root, [{ path: directory }]);
      let source;
      try {
        const info = lstatSync(file);
        requireValue(
          info.isFile() &&
            !info.isSymbolicLink() &&
            realpathSync(file) === file,
          "unconfirmed",
          `${directory}: expected a regular non-redirected file`,
        );
        requireValue(
          info.size <= 1_048_576,
          "unconfirmed",
          "file exceeds 1MiB",
        );
        source = readFileSync(file, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return parseDeliverables(source, directory);
    },
  );
}
