import { mergeCheckerRegistries } from "@silvermoon-work/check-task-sdk";
import { project } from "./checks/project.js";
import { repositories } from "./checks/repositories.js";

export const registry = mergeCheckerRegistries({ project }, repositories);
