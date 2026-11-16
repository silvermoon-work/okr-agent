import type { CheckContext } from "@silvermoon-work/check-task-sdk";
import type { Input } from "./contract.js";
import { projectRegistry } from "./inspect.js";
import { publicMetadata, type Metadata } from "./metadata.js";
import { scriptResources } from "./script-profile.js";

export function projectCheck(
  metadata: (signal: AbortSignal) => Metadata = publicMetadata,
) {
  return async (context: CheckContext, input: Input) => {
    const resource = async (name: string) => {
      const cid = await context.resolveContent(
        context.bundle,
        `resources/assets/${name}`,
        { signal: context.signal },
      );
      const asset = await context.readContent(cid, { signal: context.signal });
      if (asset.kind !== "file")
        throw new Error(`Canonical ${name} asset is not a file`);
      return new Uint8Array(await new Response(asset.content).arrayBuffer());
    };
    const [agents, publisher, publishWorkflow, ciWorkflow] = await Promise.all([
      resource("AGENTS.md"),
      resource("npm-publish.mjs"),
      resource("publish-npm.yaml"),
      resource("npm-ci.yaml"),
    ]);
    return projectRegistry(input, context.signal, {
      agents,
      publisher,
      publishWorkflow,
      ciWorkflow,
      scripts: Object.fromEntries(
        await Promise.all(
          scriptResources.map(
            async ([name, path]) => [name, await resource(path)] as const,
          ),
        ),
      ),
      metadata: metadata(context.signal),
    });
  };
}
