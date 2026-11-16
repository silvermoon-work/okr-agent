import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "../src-legacy/contract.js";
import { projectCheck } from "../src-legacy/callback.js";
import type { Metadata } from "../src-legacy/metadata.js";
import { metadataFixture } from "./metadata-fixture.js";

const provider = (): Metadata => metadataFixture();
runCheck(
  contract,
  { registry: projectCheck(provider), root: "project" },
  { assets: true },
);
