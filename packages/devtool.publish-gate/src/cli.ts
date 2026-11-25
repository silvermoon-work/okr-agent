import { readFileSync } from "node:fs";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { checkPublishContext, selectPublishTarget } from "./index.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const program = new Command()
    .name("publish-gate")
    .description(
      "Check the Silvermoon npm publishing context without publishing.",
    )
    .version(manifest.version)
    .exitOverride()
    .showHelpAfterError()
    .addHelpText("after", '\nHook: "prepublishOnly": "publish-gate check"');
  program
    .command("target")
    .description(
      "Select the declared package for this event; this does not approve publication.",
    )
    .option("--json", "write the target as JSON for workflow orchestration")
    .action((options: { json?: boolean }) => {
      const result = selectPublishTarget();
      process.stdout.write(
        options.json
          ? `${JSON.stringify(result)}\n`
          : `${result.name}@${result.version} (${result.directory}, ${result.channel})\n`,
      );
    });
  program
    .command("check")
    .description(
      "Require verified CI, an authorized release context and registry eligibility.",
    )
    .option(
      "--workflow <filename>",
      "require this workflow's latest exact-SHA run to succeed (repeat for AND; no event/branch/job restrictions)",
      (value: string, previous: string[] = []) => {
        if (value.startsWith("-"))
          throw new InvalidArgumentError(
            "Expected a workflow filename, not another option.",
          );
        return [...previous, value];
      },
    )
    .addHelpText(
      "after",
      "\nWithout --workflow, require the legacy ci.yaml main-push jobs and aggregate.\nExample: publish-gate check --workflow ci.yaml --workflow release-validation.yaml",
    )
    .action(async (options: { workflow?: string[] }) => {
      const result = await checkPublishContext(
        process.cwd(),
        process.env,
        options.workflow,
      );
      process.stdout.write(
        `Publish gate passed: ${result.name}@${result.version} (${result.channel}${result.dryRun ? ", dry-run" : ""}).\n`,
      );
    });
  try {
    if (argv.length === 0) {
      program.outputHelp();
      return 0;
    }
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    process.stderr.write(
      `publish-gate: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
