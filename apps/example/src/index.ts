import { describeWorkspace } from "@silvermoon-work/core";

export function getExampleMessage(): string {
  return describeWorkspace({
    name: "example",
    kind: "application",
  });
}
