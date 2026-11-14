import { stripTypeScriptTypes } from "node:module";
import { parse, tokenizer } from "acorn";
import { record, Unconfirmed } from "./files.js";

type Node = { type: string; [key: string]: unknown };
function node(value: unknown): Node {
  const result = record(value);
  if (typeof result.type !== "string")
    throw new Unconfirmed("unknown syntax node");
  return result as Node;
}
function list(value: unknown): Node[] {
  if (!Array.isArray(value)) throw new Unconfirmed("unknown syntax list");
  return value.map(node);
}
function name(value: unknown): string | undefined {
  const item = node(value);
  return typeof item.name === "string"
    ? item.name
    : typeof item.value === "string"
      ? item.value
      : undefined;
}
export function workerModule(text: string, typescript: boolean) {
  let body: Node[];
  try {
    body = parse(
      typescript ? stripTypeScriptTypes(text, { mode: "strip" }) : text,
      {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    ).body.map(node);
  } catch {
    throw new Unconfirmed(
      "Worker module syntax cannot be statically confirmed",
    );
  }
  const imports = new Map<string, string>();
  const constants = new Map<string, Node>();
  const classes = new Set<string>();
  const durable = new Set<string>();
  const nodeImports = new Set<string>();
  let exported: Node | undefined;
  let indirect = false;
  for (const statement of body) {
    if (statement.type === "ImportDeclaration") {
      const source = name(statement.source);
      if (source?.startsWith("node:")) nodeImports.add(source);
      if (source === "cloudflare:workers")
        for (const specifier of list(statement.specifiers))
          if (specifier.type === "ImportSpecifier")
            imports.set(name(specifier.local)!, name(specifier.imported)!);
    }
    if (statement.type === "VariableDeclaration" && statement.kind === "const")
      for (const declaration of list(statement.declarations))
        if (node(declaration.id).type === "Identifier" && declaration.init)
          constants.set(name(declaration.id)!, node(declaration.init));
  }
  for (const statement of body) {
    if (statement.type === "ExportDefaultDeclaration")
      exported = node(statement.declaration);
    if (statement.type === "ExportAllDeclaration") indirect = true;
    if (statement.type === "ExportNamedDeclaration") {
      if (statement.source || list(statement.specifiers).length)
        indirect = true;
      if (statement.declaration) {
        const declaration = node(statement.declaration);
        if (declaration.type === "ClassDeclaration") {
          const id = name(declaration.id)!;
          classes.add(id);
          if (
            declaration.superClass &&
            imports.get(name(declaration.superClass) ?? "") === "DurableObject"
          )
            durable.add(id);
        }
      }
    }
  }
  if (exported?.type === "Identifier") {
    const resolved = constants.get(name(exported)!);
    if (!resolved)
      throw new Unconfirmed("indirect Worker default export is unsupported");
    exported = resolved;
  }
  let fetch = false;
  if (exported?.type === "ObjectExpression") {
    const properties = list(exported.properties);
    if (
      properties.some(
        (property) => property.type === "SpreadElement" || property.computed,
      )
    )
      throw new Unconfirmed("dynamic Worker default export is unsupported");
    for (const property of properties) {
      if (name(property.key) !== "fetch") continue;
      if (property.kind !== "init")
        throw new Unconfirmed("Worker fetch accessor is unsupported");
      let value = node(property.value);
      if (value.type === "Identifier") {
        const resolved = constants.get(name(value)!);
        if (!resolved)
          throw new Unconfirmed("indirect Worker fetch is unsupported");
        value = resolved;
      }
      fetch = ["FunctionExpression", "ArrowFunctionExpression"].includes(
        value.type,
      );
    }
  } else if (
    exported?.type === "ClassDeclaration" &&
    exported.superClass &&
    imports.get(name(exported.superClass) ?? "") === "WorkerEntrypoint"
  ) {
    fetch = list(node(exported.body).body).some(
      (method) =>
        !method.computed &&
        !method.static &&
        name(method.key) === "fetch" &&
        method.kind === "method",
    );
  } else if (exported) {
    throw new Unconfirmed("Worker default export shape is unsupported");
  }
  return { fetch, classes, durable, indirect, nodeImports };
}

export function environmentBindings(text: string): Set<string> {
  let tokens: { label: string; value: unknown }[];
  try {
    tokens = [
      ...tokenizer(text, { ecmaVersion: "latest", sourceType: "module" }),
    ].map((token) => ({
      label: token.type.label,
      value: record(token).value,
    }));
  } catch {
    throw new Unconfirmed("generated types syntax cannot be confirmed");
  }
  if (
    !tokens.some(
      (token, i) =>
        token.label === "name" &&
        token.value === "namespace" &&
        tokens[i + 1]?.label === "name" &&
        tokens[i + 1]?.value === "Cloudflare",
    )
  )
    throw new Unconfirmed(
      "only an explicit generated Cloudflare.Env declaration is supported",
    );
  const bindings = new Set<string>();
  let found = false;
  for (let i = 0; i < tokens.length; i++) {
    if (    tokens[i]?.label !== "name" ||
    tokens[i]?.value !== "interface" ||
    tokens[i + 1]?.label !== "name" || tokens[i + 1]?.value !== "Env")
      continue;
    found = true;
    i += 2;
    while (i < tokens.length && tokens[i]?.label !== "{") {
      if (tokens[i]?.label === ";" || tokens[i]?.label === "}")
        throw new Unconfirmed("unknown Env declaration");
      i++;
    }
    let depth = 1;
    let property = true;
    for (i++; i < tokens.length && depth; i++) {
      const token = tokens[i]!;
      if (depth === 1 && property && !["}", ";"].includes(token.label)) {
        const colon =
          tokens[i + 1]?.label === "?" ? tokens[i + 2] : tokens[i + 1];
        if (
          !["name", "string"].includes(token.label) ||
          typeof token.value !== "string" ||
          colon?.label !== ":"
        )
          throw new Unconfirmed(
            "dynamic or method Env members are unsupported",
          );
        bindings.add(token.value);
        property = false;
      }
      if (token.label === "{") depth++;
      if (token.label === "}") depth--;
      if (depth === 1 && token.label === ";") property = true;
    }
    if (depth) throw new Unconfirmed("incomplete Env declaration");
    i--;
  }
  if (!found) throw new Unconfirmed("Cloudflare.Env is missing");
  return bindings;
}
