import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "../src/contract.js";
import { projectCheck } from "../src/callback.js";
import type { Metadata } from "../src/metadata.js";
import { metadataFixture } from "./metadata-fixture.js";

const provider = (): Metadata => metadataFixture();
runCheck(contract, projectCheck(provider), { assets: true });
