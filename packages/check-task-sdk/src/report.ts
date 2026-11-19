export interface ReportProblem {
  readonly checkpoint: string;
  readonly code: string;
  readonly brief: string;
}
export interface CheckReference {
  readonly checkpoint: string;
  readonly documentation: string;
}
interface ReportBody {
  readonly documentation: "references/check.md";
  readonly references: readonly CheckReference[];
}
export type CheckReport = ReportBody &
  (
    | { readonly pass: true }
    | {
        readonly pass: false;
        readonly problems: readonly [ReportProblem, ...ReportProblem[]];
      }
  );
