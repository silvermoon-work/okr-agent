import { project } from "./checks/project.js";
import { workspace } from "./checks/workspace.js";

export const checkpoints = [project, workspace] as const;
