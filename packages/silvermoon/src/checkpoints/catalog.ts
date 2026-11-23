import { documentation as global } from "./global/documentation.js";
import { documentation as repository } from "./repository/documentation.js";
import { documentation as branch } from "./branch/documentation.js";
import { documentation as silvermoonFolder } from "./silvermoon-folder/documentation.js";
import { documentation as ideaFolder } from "./idea-folder/documentation.js";
import { documentation as requirements } from "./requirements/documentation.js";
import { documentation as research } from "./research/documentation.js";
import { documentation as technical } from "./technical/documentation.js";
import { documentation as testIndex } from "./test-index/documentation.js";
import { documentation as testCases } from "./test-cases/documentation.js";
import { documentation as implementation } from "./implementation/documentation.js";
import { documentation as deployment } from "./deployment/documentation.js";
import { documentation as preCommit } from "./pre-commit/documentation.js";
import { documentation as commitSnapshot } from "./commit-snapshot/documentation.js";
import { documentation as commitHistory } from "./commit-history/documentation.js";
import { documentation as userAcceptance } from "./user-acceptance/documentation.js";
export const prerequisiteDocumentation = [
  global,
  repository,
  branch,
  silvermoonFolder,
] as const;
export const consensusDocumentation = {
  requirements,
  research,
  technical,
  cases: testIndex,
  tests: testCases,
} as const;
export const setupDocumentation = [global] as const;
export const projectDocumentation = [
  ...prerequisiteDocumentation,
  preCommit,
] as const;
export const ideaDocumentation = [
  ...prerequisiteDocumentation,
  ideaFolder,
  requirements,
  research,
  technical,
  testIndex,
  testCases,
  implementation,
  deployment,
  userAcceptance,
] as const;
export const commitDocumentation = [commitSnapshot, commitHistory] as const;
