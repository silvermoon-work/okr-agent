export const checkpoints = [
  "requirements",
  "research-scope",
  "technical-spec",
  "test-scope",
  "test-spec",
  "implementation",
  "deployment",
] as const;
export type Checkpoint = (typeof checkpoints)[number];
export type AcceptanceMode = "consensus" | "delegated";
export type AcceptancePolicy = Partial<Record<Checkpoint, AcceptanceMode>>;
