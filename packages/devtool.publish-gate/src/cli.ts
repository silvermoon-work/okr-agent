import { readFileSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { checkPublishContext } from "./index.js";

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
    .command("check")
    .description(
      "Require verified CI, an authorized release context and registry eligibility.",
    )
    .action(async () => {
      const result = await checkPublishContext();
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
