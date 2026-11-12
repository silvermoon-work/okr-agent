import { parse } from "acorn";
import { type Files, Unconfirmed, record } from "./files.js";

type Node = { type: string; [key: string]: unknown };
function node(value: unknown): Node {
  const raw = record(value);
  if (typeof raw.type !== "string")
    throw new Unconfirmed("unsupported syntax node");
  return raw as Node;
}
function nodes(value: unknown): Node[] {
  if (!Array.isArray(value)) throw new Unconfirmed("unsupported syntax list");
  return value.map(node);
}
const referenceTag = Symbol("recognized import reference");
interface Reference {
  readonly reference: string;
  readonly [referenceTag]: true;
}
function imported(reference: string): Reference {
  return { reference, [referenceTag]: true };
}
export const typeAwarePreset = Symbol(
  "recognized type-aware TypeScript preset",
);
export const typescriptPreset = Symbol("recognized TypeScript preset");
function reference(value: unknown): value is Reference {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Record<symbol, unknown>)[referenceTag] === true
  );
}
const preset = (name: string): unknown => {
  if (
    /^typescript-eslint\.configs\.(recommendedTypeChecked|strictTypeChecked|recommendedTypeCheckedOnly|strictTypeCheckedOnly)$/.test(
      name,
    )
  )
    return [{ [typeAwarePreset]: true, [typescriptPreset]: true }];
  if (/^typescript-eslint\.configs\.(recommended|strict)$/.test(name))
    return [{ [typescriptPreset]: true }];
  if (name === "@eslint/js.configs.recommended") return {};
  if (
    [
      "globals.node",
      "globals.nodeBuiltin",
      "globals.browser",
      "globals.commonjs",
      "globals.es2015",
      "globals.es2020",
      "globals.es2021",
      "globals.es2022",
      "globals.worker",
      "globals.serviceworker",
    ].includes(name)
  )
    return {};
  if (name === "import.meta.dirname") return "__CONFIG_DIRECTORY__";
  throw new Unconfirmed(`unrecognized imported value: ${name}`);
};

/** Recognizes data and a finite set of declarative wrappers; never calls target code. */
export function javascript(text: string): unknown {
  let body: Node[];
  try {
    body = nodes(
      parse(text, { ecmaVersion: "latest", sourceType: "module" }).body,
    );
  } catch {
    throw new Unconfirmed(
      "unsupported JavaScript/TypeScript configuration syntax",
    );
  }
  const environment = new Map<string, unknown>();
  const imports = new Set([
    "typescript-eslint",
    "@eslint/js",
    "globals",
    "vitest/config",
    "eslint/config",
    "prettier",
  ]);
  const material = (value: unknown): unknown =>
    reference(value) ? preset(value.reference) : value;
  const evaluate = (input: unknown, locals = environment): unknown => {
    const n = node(input);
    switch (n.type) {
      case "Literal":
        if (n.regex || n.bigint)
          throw new Unconfirmed("regular expressions/bigints are unsupported");
        return n.value;
      case "Identifier":
        if (typeof n.name !== "string" || !locals.has(n.name))
          throw new Unconfirmed("unbound configuration identifier");
        return locals.get(n.name);
      case "MetaProperty":
        if (node(n.meta).name === "import" && node(n.property).name === "meta")
          return imported("import.meta");
        break;
      case "MemberExpression": {
        if (n.computed || n.optional) break;
        const object = evaluate(n.object, locals);
        const key = node(n.property).name;
        if (typeof key !== "string") break;
        if (reference(object)) return imported(`${object.reference}.${key}`);
        return record(object)[key];
      }
      case "ArrayExpression": {
        const output: unknown[] = [];
        for (const element of nodes(n.elements)) {
          if (element.type === "SpreadElement") {
            const value = material(evaluate(element.argument, locals));
            if (!Array.isArray(value))
              throw new Unconfirmed("array spread is not static");
            output.push(...(value as unknown[]));
          } else output.push(material(evaluate(element, locals)));
        }
        return output;
      }
      case "ObjectExpression": {
        const output: Record<string, unknown> = {};
        for (const property of nodes(n.properties)) {
          if (property.type === "SpreadElement")
            Object.assign(
              output,
              record(material(evaluate(property.argument, locals))),
            );
          else {
            if (
              property.computed ||
              property.method ||
              property.kind !== "init"
            )
              throw new Unconfirmed("dynamic object member");
            const keyNode = node(property.key);
            const key =
              keyNode.type === "Identifier" ? keyNode.name : keyNode.value;
            if (
              typeof key !== "string" ||
              ["__proto__", "constructor", "prototype"].includes(key)
            )
              throw new Unconfirmed("unsupported object key");
            output[key] = material(evaluate(property.value, locals));
          }
        }
        return output;
      }
      case "CallExpression": {
        const calleeNode = node(n.callee);
        if (
          calleeNode.type === "MemberExpression" &&
          !calleeNode.computed &&
          node(calleeNode.property).name === "map"
        ) {
          const target = evaluate(calleeNode.object, locals);
          if (
            !reference(target) ||
            !/^typescript-eslint\.configs\.(recommended|strict)TypeChecked(?:Only)?$/.test(
              target.reference,
            )
          )
            throw new Unconfirmed("only recognized preset.map is supported");
          const args = nodes(n.arguments);
          const callback = args[0];
          if (
            args.length !== 1 ||
            callback?.type !== "ArrowFunctionExpression" ||
            callback.async
          )
            throw new Unconfirmed("unsupported preset map");
          const parameters = nodes(callback.params);
          const parameter = parameters[0];
          if (
            parameters.length !== 1 ||
            parameter?.type !== "Identifier" ||
            typeof parameter.name !== "string"
          )
            throw new Unconfirmed("unsupported preset map parameter");
          return (preset(target.reference) as unknown[]).map((value) => {
            const inner = new Map(locals);
            inner.set(parameter.name as string, value);
            return material(evaluate(callback.body, inner));
          });
        }
        const callee = evaluate(n.callee, locals);
        if (
          !reference(callee) ||
          ![
            "vitest/config.defineConfig",
            "eslint/config.defineConfig",
            "typescript-eslint.config",
          ].includes(callee.reference)
        )
          throw new Unconfirmed("configuration calls are not executed");
        const args: unknown[] = [];
        for (const arg of nodes(n.arguments)) {
          const value = material(
            evaluate(arg.type === "SpreadElement" ? arg.argument : arg, locals),
          );
          if (arg.type === "SpreadElement") {
            if (!Array.isArray(value))
              throw new Unconfirmed("dynamic call spread");
            args.push(...(value as unknown[]));
          } else args.push(value);
        }
        if (callee.reference === "vitest/config.defineConfig") {
          if (
            args.length !== 1 ||
            typeof args[0] !== "object" ||
            Array.isArray(args[0])
          )
            throw new Unconfirmed("defineConfig requires a static object");
          return args[0];
        }
        return args.flat();
      }
    }
    throw new Unconfirmed(`unsupported configuration expression: ${n.type}`);
  };
  let result: unknown;
  let exported = false;
  for (const statement of body) {
    if (statement.type === "ImportDeclaration") {
      const source = node(statement.source).value;
      if (typeof source !== "string" || !imports.has(source))
        throw new Unconfirmed("unknown configuration import (not loaded)");
      for (const specifier of nodes(statement.specifiers)) {
        const local = node(specifier.local).name;
        if (typeof local !== "string")
          throw new Unconfirmed("invalid import binding");
        const importedName =
          specifier.type === "ImportSpecifier"
            ? node(specifier.imported).name
            : undefined;
        if (importedName !== undefined && typeof importedName !== "string")
          throw new Unconfirmed("unsupported named import");
        environment.set(
          local,
          imported(importedName ? `${source}.${importedName}` : source),
        );
      }
    } else if (
      statement.type === "VariableDeclaration" &&
      statement.kind === "const"
    ) {
      for (const declaration of nodes(statement.declarations)) {
        const id = node(declaration.id);
        if (id.type !== "Identifier" || typeof id.name !== "string")
          throw new Unconfirmed("unsupported binding");
        environment.set(id.name, material(evaluate(declaration.init)));
      }
    } else if (statement.type === "ExportDefaultDeclaration" && !exported) {
      result = material(evaluate(statement.declaration));
      exported = true;
    } else if (statement.type !== "EmptyStatement")
      throw new Unconfirmed(
        `unsupported configuration statement: ${statement.type}`,
      );
  }
  if (!exported) throw new Unconfirmed("default export is missing");
  return result;
}

export function jsonc(text: string): Record<string, unknown> {
  // Tokenize comments/strings instead of stripping comment-like text inside strings.
  let clean = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      const start = i++;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "\\") i += 2;
        else if (text[i++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) throw new Unconfirmed("unterminated JSONC string");
      clean += text.slice(start, i);
    } else if (text.slice(i, i + 2) === "//") {
      while (i < text.length && text[i] !== "\n") i++;
      clean += "\n";
    } else if (text.slice(i, i + 2) === "/*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Unconfirmed("unterminated JSONC comment");
      clean += " ";
      i = end + 2;
    } else if (c === ",") {
      clean += ",";
      i++;
    } else {
      clean += c;
      i++;
    }
  }
  // A second string-aware pass removes only commas followed by a closing delimiter.
  let normalized = "";
  let quoted = false;
  for (let j = 0; j < clean.length; j++) {
    const c = clean[j]!;
    if (quoted && c === "\\") {
      normalized += c + clean[++j]!;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (!quoted && c === "," && /^\s*[}\]]/.test(clean.slice(j + 1))) continue;
    normalized += c;
  }
  try {
    return record(JSON.parse(normalized));
  } catch {
    throw new Unconfirmed("invalid JSONC");
  }
}

export interface TsConfig {
  options: Record<string, unknown>;
  includes: { base: string; patterns: string[] };
  excludes: { base: string; patterns: string[] };
  explicitInclude: boolean;
  explicitExclude: boolean;
  outputDirectories: string[];
  files?: { base: string; paths: string[] };
  references: string[];
}
export function compilerConsistency(
  options: Record<string, unknown>,
): string[] {
  const enumValue = (name: string, supported: string[]): string | undefined => {
    const value = options[name];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !supported.includes(value.toLowerCase()))
      throw new Unconfirmed(`unsupported TypeScript ${name} value`);
    return value.toLowerCase();
  };
  const module = enumValue("module", [
    "none",
    "commonjs",
    "amd",
    "umd",
    "system",
    "es6",
    "es2015",
    "es2020",
    "es2022",
    "esnext",
    "node16",
    "nodenext",
    "preserve",
  ]);
  const resolution = enumValue("moduleResolution", [
    "classic",
    "node",
    "node10",
    "node16",
    "nodenext",
    "bundler",
  ]);
  enumValue("target", [
    "es5",
    "es6",
    "es2015",
    "es2016",
    "es2017",
    "es2018",
    "es2019",
    "es2020",
    "es2021",
    "es2022",
    "es2023",
    "es2024",
    "esnext",
  ]);
  if (
    resolution &&
    ["node16", "nodenext", "bundler"].includes(resolution) &&
    !module
  )
    throw new Unconfirmed(
      `explicit module is required to confirm moduleResolution:${resolution}`,
    );
  const failures: string[] = [];
  const nodeModes = ["node16", "nodenext"];
  if (
    resolution &&
    nodeModes.includes(resolution) &&
    (!module || !nodeModes.includes(module))
  )
    failures.push(`module:${module} 与 moduleResolution:${resolution} 不兼容`);
  else if (
    module &&
    nodeModes.includes(module) &&
    resolution &&
    !nodeModes.includes(resolution)
  )
    failures.push(`module:${module} 与 moduleResolution:${resolution} 不兼容`);
  else if (resolution === "bundler" && module === "commonjs")
    throw new Unconfirmed(
      "CommonJS/Bundler compatibility depends on the TypeScript version",
    );
  else if (
    resolution === "bundler" &&
    module &&
    !["es6", "es2015", "es2020", "es2022", "esnext", "preserve"].includes(
      module,
    )
  )
    failures.push(`module:${module} 不支持 moduleResolution:bundler`);
  return failures;
}
export async function tsconfig(
  files: Files,
  path: string,
  seen = new Set<string>(),
): Promise<TsConfig> {
  if (seen.has(path) || seen.size >= 32)
    throw new Unconfirmed("cyclic/excessive TypeScript extends");
  const next = new Set(seen).add(path);
  const raw = jsonc(await files.text(path));
  const base = files.parent(path);
  let inherited: TsConfig = {
    options: {},
    includes: { base, patterns: ["**/*"] },
    excludes: {
      base,
      patterns: ["node_modules/**", "bower_components/**", "jspm_packages/**"],
    },
    references: [],
    explicitInclude: false,
    explicitExclude: false,
    outputDirectories: [],
  };
  if (raw.extends !== undefined) {
    if (typeof raw.extends !== "string" || !raw.extends.startsWith("."))
      throw new Unconfirmed(
        "only a single local relative tsconfig extends is supported",
      );
    let parent = files.path(base, raw.extends);
    if (!parent.endsWith(".json")) parent += ".json";
    inherited = await tsconfig(files, parent, next);
  }
  const patterns = (
    value: unknown,
    fallback: TsConfig["includes"],
  ): TsConfig["includes"] => {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
      throw new Unconfirmed("invalid tsconfig patterns");
    return { base, patterns: value as string[] };
  };
  const include = patterns(
    raw.include,
    inherited.explicitInclude
      ? inherited.includes
      : {
          base,
          patterns: raw.files !== undefined || inherited.files ? [] : ["**/*"],
        },
  );
  const exclude = patterns(
    raw.exclude,
    inherited.explicitExclude
      ? inherited.excludes
      : {
          base,
          patterns: [
            "node_modules/**",
            "bower_components/**",
            "jspm_packages/**",
          ],
        },
  );
  const ownFiles =
    raw.files === undefined
      ? inherited.files
      : { base, paths: patterns(raw.files, include).patterns };
  const references: string[] = [];
  if (raw.references !== undefined) {
    if (!Array.isArray(raw.references))
      throw new Unconfirmed("invalid project references");
    for (const reference of raw.references) {
      const target = record(reference).path;
      if (typeof target !== "string")
        throw new Unconfirmed("invalid reference path");
      let ref = files.path(base, target);
      if (!ref.endsWith(".json")) ref += "/tsconfig.json";
      references.push(ref);
    }
  }
  const ownOptions =
    raw.compilerOptions === undefined ? {} : record(raw.compilerOptions);
  const outputDirectories = [...inherited.outputDirectories];
  for (const name of ["outDir", "declarationDir"]) {
    if (ownOptions[name] !== undefined) {
      if (typeof ownOptions[name] !== "string")
        throw new Unconfirmed(`invalid ${name}`);
      outputDirectories.push(files.path(base, ownOptions[name]));
    }
  }
  return {
    options: { ...inherited.options, ...ownOptions },
    includes: include,
    excludes: exclude,
    explicitInclude: raw.include !== undefined || inherited.explicitInclude,
    explicitExclude: raw.exclude !== undefined || inherited.explicitExclude,
    outputDirectories,
    ...(ownFiles ? { files: ownFiles } : {}),
    references,
  };
}
