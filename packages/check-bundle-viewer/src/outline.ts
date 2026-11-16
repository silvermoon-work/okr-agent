import type { CheckBundleSpec, ChildDefinition } from "./spec.js";

export interface OutlineNode {
  id: string;
  checker: string;
  edge?: ChildDefinition;
  reference?: "shared";
  targetId?: string;
  detached: boolean;
  children: OutlineNode[];
}

/** Requires a validated DAG. Each definition expands once; shared references stay visible. */
export function createOutline(spec: CheckBundleSpec): OutlineNode[] {
  const first = new Map<string, string>();
  const visit = (
    checker: string,
    id: string,
    detached: boolean,
    edge?: ChildDefinition,
  ): OutlineNode => {
    const targetId = first.get(checker);
    const node: OutlineNode = {
      id,
      checker,
      detached,
      children: [],
      ...(edge ? { edge } : {}),
      ...(targetId
        ? {
            reference: "shared",
            targetId,
          }
        : {}),
    };
    if (targetId) return node;
    first.set(checker, id);
    node.children = spec.checkers[checker]!.children.map((child, index) =>
      visit(child.checker, `${id}-${String(index)}`, detached, child),
    );
    return node;
  };
  const roots = [visit(spec.root, "root", false)];
  for (const checker of Object.keys(spec.checkers))
    if (!first.has(checker))
      roots.push(visit(checker, `detached-${String(roots.length)}`, true));
  return roots;
}
