export interface Deliverable {
  path: string;
  type: string;
  [key: string]: unknown;
}
export interface NpmMapping {
  id: string;
  name: string;
  directory: string;
}
export class DeliverablesError extends Error {
  status: "missing" | "mismatch" | "unconfirmed";
}
export const legacyDeliveryPaths: string[];
export function parseDeliverables(
  source?: string,
  directory?: string,
): Deliverable[];
export function validateDeliveryPaths(
  root: string,
  entries: Deliverable[],
): void;
export function npmMappings(
  entries: Deliverable[],
  projects: { directory: string; manifest: Record<string, unknown> }[],
): NpmMapping[];
export function loadDeliverables(
  root: string,
  directories?: string[],
): Deliverable[];
