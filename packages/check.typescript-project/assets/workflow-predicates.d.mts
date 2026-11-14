export interface WorkflowFailure {
  status: "mismatch" | "unconfirmed";
  brief: string;
}
export function isNodeVersions(value: unknown): value is string[];
export function workflowPredicates(
  workflow: Record<string, unknown>,
  kind?: "quality" | "publisher" | "native",
  native?: string[],
): WorkflowFailure[];
