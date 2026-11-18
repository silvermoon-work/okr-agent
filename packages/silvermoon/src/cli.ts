import { Command, CommanderError, Option } from "commander";
import { join, resolve } from "node:path";
import { currentDevice, deviceLanguage } from "./device.js";
import {
  invariant,
  reduce,
  SilvermoonError,
  text,
  validIdeaId,
  parseBootstrap,
} from "./domain.js";
import { bundledArtifact, observe, type Report } from "./host.js";
import {
  discoverRoot,
  git,
  readProject,
  readRegular,
  protectedPath,
  remoteTip,
  localContext,
  localIdeaState,
  selectIdea,
  type Snapshot,
} from "./repository.js";
import { appendEvent, createIdea, replay } from "./write.js";
import type { Event } from "./domain.js";

export interface CliIo {
  readonly cwd: string;
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  readonly signal?: AbortSignal;
}
interface Options {
  root?: string;
  audience?: "human" | "agent";
  json?: boolean;
}
export function renderReport(report: Report): string {
  const lines = [
    "# Silvermoon",
    `Check: ${report.checkCid}`,
    report.result.pass ? "Result: pass" : "Result: gaps remain",
    ...(report.result.problems ?? []).flatMap((problem) => [
      `\n## ${problem.code}`,
      problem.brief,
    ]),
    ...report.documents.flatMap((document) => [
      `\n## Documentation (${document.cid})`,
      document.text,
    ]),
  ];
  return lines.join("\n") + "\n";
}
export async function runCli(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const program = new Command();
  let exit = 0;
  program
    .name("silvermoon")
    .description(
      "Check-backed consensus and evidence; archived Ideas are never read.",
    )
    .version("0.1.0-rc.1")
    .option("--root <directory>", "Select a Git repository root")
    .addOption(
      new Option("--audience <audience>", "Output audience").choices([
        "human",
        "agent",
      ]),
    )
    .option("--json", "Machine-readable silvermoon/v1 response")
    .configureOutput({
      writeOut: (message) => {
        io.stdout.write(message);
      },
      writeErr: (message) => {
        io.stderr.write(message);
      },
      outputError: (message) => {
        io.stderr.write(
          JSON.stringify({
            error: { code: "usage", message: message.trim() },
          }) + "\n",
        );
      },
    })
    .exitOverride();
  program.hook("preAction", () => {
    const options = program.opts<Options>();
    invariant(
      !(options.json && options.audience),
      "usage",
      "--json and --audience are mutually exclusive.",
    );
  });
  const root = async (): Promise<string> => {
    const options = program.opts<Options>();
    const selected = options.root
      ? resolve(io.cwd, options.root)
      : await discoverRoot(io.cwd);
    invariant(
      selected,
      "target-context",
      "This command requires a Git repository; use --root.",
    );
    return selected;
  };
  const emit = (value: unknown) => {
    const options = program.opts<Options>();
    invariant(
      !(options.json && options.audience),
      "usage",
      "--json and --audience are mutually exclusive.",
    );
    io.stdout.write(
      options.json
        ? JSON.stringify(value) + "\n"
        : typeof value === "object" &&
            value !== null &&
            "schema" in value &&
            value.schema === "silvermoon/v1" &&
            "result" in value
          ? renderReport(value as Report)
          : JSON.stringify(value, null, 2) + "\n",
    );
  };
  program
    .command("whats-next [idea]")
    .description(
      "Execute the exact pinned Check; gaps are normal observations.",
    )
    .action(async (selector?: string) => {
      const options = program.opts<Options>();
      const directory = options.root
        ? resolve(io.cwd, options.root)
        : await discoverRoot(io.cwd);
      invariant(
        !selector || directory,
        "target-context",
        "Idea selectors require a project.",
      );
      let cid: string | undefined;
      let id: string | undefined;
      if (selector && directory) {
        if (validIdeaId(selector)) {
          const path = join(
            directory,
            ".silvermoon",
            "i",
            selector,
            "idea.json",
          );
          await protectedPath(directory, path);
          const bootstrap = parseBootstrap(
            text(await readRegular(path, io.signal)),
            selector,
          );
          cid = bootstrap.checkCid;
          id = bootstrap.id;
        } else {
          const selected = selectIdea(await readProject(directory), selector);
          cid = selected.bootstrap.checkCid;
          id = selected.bootstrap.id;
        }
      }
      const report = await observe(
        {
          userHome: currentDevice().home,
          ...(directory ? { repoRoot: directory } : {}),
          ...(id ? { idea: id } : {}),
        },
        {
          ...(cid ? { cid } : {}),
          ...(io.signal ? { signal: io.signal } : {}),
        },
      );
      emit(report);
    });
  program
    .command("check")
    .description("Validate a snapshot, not lifecycle completion.")
    .option("--worktree", "Validate working files")
    .option("--staged", "Validate index")
    .option("--commit <sha>", "Validate exact commit")
    .option("--remote", "Fetch and validate configured primary")
    .action(
      async (options: {
        worktree?: boolean;
        staged?: boolean;
        commit?: string;
        remote?: boolean;
      }) => {
        invariant(
          [
            options.worktree,
            options.staged,
            options.commit,
            options.remote,
          ].filter(Boolean).length <= 1,
          "usage",
          "Choose at most one snapshot selector.",
        );
        const directory = await root();
        let snapshot: Snapshot = options.worktree
          ? "worktree"
          : options.staged
            ? "staged"
            : (options.commit ?? "HEAD");
        if (options.remote) snapshot = await remoteTip(directory, io.signal);
        const report = await observe(
          {
            userHome: currentDevice().home,
            repoRoot: directory,
          },
          {
            operation: { mode: "snapshot", snapshot },
            ...(io.signal ? { signal: io.signal } : {}),
          },
        );
        emit(report);
        exit = report.result.pass ? 0 : 1;
      },
    );
  program
    .command("create-idea")
    .description("Create only a new Idea scaffold; never commits or signs off.")
    .option(
      "--language <tag>",
      "Canonical content-language override (not output locale)",
    )
    .action(async (options: { language?: string }) => {
      const directory = await root();
      const artifact = await bundledArtifact();
      await deviceLanguage(currentDevice());
      const created = await createIdea(directory, artifact.cid, {
        ...(options.language ? { language: options.language } : {}),
        ...(io.signal ? { signal: io.signal } : {}),
      });
      const project = await readProject(directory);
      const selected = selectIdea(project, created.id);
      const user = await deviceLanguage(currentDevice());
      const state = reduce(selected, {
        head: await git(directory, ["rev-parse", "HEAD"]),
        ...(project.config.preferredLanguage
          ? { projectLanguage: project.config.preferredLanguage }
          : {}),
        ...(user ? { userLanguage: user } : {}),
      });
      emit({
        ...created,
        contentLanguage: state.contentLanguage,
        scaffoldLanguage: "en-US",
        scaffoldFallback: state.contentLanguage !== "en-US",
        instruction:
          "Replace scaffold prompts in the effective content language; signoffs require real semantic review, not merely nonempty files.",
      });
    });
  program
    .command("list-ideas")
    .description(
      "Query only .silvermoon/i, without fetch or cleanliness requirements.",
    )
    .option("--all", "Include abandoned and completed Ideas")
    .addOption(
      new Option("--state <level>", "Repeatable domain level filter")
        .choices([
          "requirements",
          "research",
          "technical",
          "cases",
          "tests",
          "synchronization",
          "implementation",
          "deployment",
          "completed",
          "abandoned",
          "unknown",
        ])
        .argParser((value: string, previous: string[]) => [...previous, value])
        .default([]),
    )
    .option(
      "--query <text>",
      "Literal case-insensitive ID, alias or Requirements text",
    )
    .option(
      "--created-after <timestamp>",
      "Inclusive RFC3339 creation lower bound",
    )
    .option(
      "--created-before <timestamp>",
      "Inclusive RFC3339 creation upper bound",
    )
    .addOption(
      new Option("--sort <direction>")
        .choices(["newest", "oldest"])
        .default("newest"),
    )
    .option("--limit <count>", "Positive result limit")
    .action(
      async (options: {
        all?: boolean;
        state: string[];
        query?: string;
        createdAfter?: string;
        createdBefore?: string;
        sort: string;
        limit?: string;
      }) => {
        const directory = await root();
        const bound = (value: string | undefined, fallback: number) => {
          if (value === undefined) return fallback;
          invariant(
            /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
              value,
            ) && Number.isFinite(Date.parse(value)),
            "usage",
            "Creation bounds must be RFC3339 timestamps.",
          );
          return Date.parse(value);
        };
        const after = bound(options.createdAfter, -Infinity);
        const before = bound(options.createdBefore, Infinity);
        invariant(after <= before, "usage", "Creation bounds are reversed.");
        const limit =
          options.limit === undefined ? Infinity : Number(options.limit);
        invariant(
          options.limit === undefined ||
            (Number.isSafeInteger(limit) &&
              limit > 0 &&
              /^[1-9][0-9]*$/.test(options.limit ?? "")),
          "usage",
          "--limit must be a positive integer.",
        );
        const project = await readProject(directory);
        const context = await localContext(project, io.signal);
        const user = await deviceLanguage(currentDevice());
        const entries = (
          await Promise.all(
            [...project.ideas.values()].map(async (selected) => {
              const state = await localIdeaState(
                project,
                selected,
                context,
                user,
                io.signal,
              );
              return {
                id: selected.bootstrap.id,
                checkCid: selected.bootstrap.checkCid,
                createdAt: selected.bootstrap.createdAt,
                state,
                title: text(selected.files.get("requirements/Spec.md")!).split(
                  "\n",
                )[0],
              };
            }),
          )
        ).filter(
          (entry) =>
            (options.all ||
              (!entry.state.abandoned && entry.state.level !== "completed")) &&
            (!options.state.length ||
              options.state.includes(entry.state.level)) &&
            Date.parse(entry.createdAt) >= after &&
            Date.parse(entry.createdAt) <= before &&
            (!options.query ||
              `${entry.id}\n${entry.state.alias ?? ""}\n${entry.title}`
                .toLowerCase()
                .includes(options.query.toLowerCase())),
        );
        entries.sort((a, b) => {
          const time = a.id
            .slice(0, 12)
            .localeCompare(b.id.slice(0, 12), "en", { numeric: false });
          const order = time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
          return options.sort === "oldest" ? order : -order;
        });
        emit({
          ideas: entries.slice(0, limit),
          observation: context.observation,
        });
      },
    );
  const events = program
    .command("event")
    .description(
      "Read or append explicit facts; confirmation flags do not authenticate humans.",
    );
  events
    .command("replay <idea>")
    .option("--cursor <cursor>", "Exact observed-prefix cursor")
    .action(async (selector: string, options: { cursor?: string }) => {
      emit(
        await replay(
          await root(),
          selector,
          options.cursor,
          await deviceLanguage(currentDevice()),
        ),
      );
    });
  events
    .command("append <idea>")
    .requiredOption("--input <file>", "Canonical event object JSON file")
    .requiredOption(
      "--expected-digest <digest>",
      "Exact raw events.jsonl SHA256 digest",
    )
    .requiredOption(
      "--expected-primary <sha>",
      "Last observed exact primary commit",
    )
    .option(
      "--confirm-human-decision",
      "Attest an actual explicit human signoff; not authentication",
    )
    .action(
      async (
        selector: string,
        options: {
          input: string;
          expectedDigest: string;
          expectedPrimary: string;
          confirmHumanDecision?: boolean;
        },
      ) => {
        const directory = await root();
        const raw: unknown = JSON.parse(
          text(await readRegular(resolve(io.cwd, options.input), io.signal)),
        );
        // appendEvent validates the complete candidate schema before any replacement.
        emit(
          await appendEvent(directory, selector, raw as Event, {
            expectedDigest: options.expectedDigest,
            expectedPrimary: options.expectedPrimary,
            confirmed: options.confirmHumanDecision ?? false,
            ...(io.signal ? { signal: io.signal } : {}),
          }),
        );
      },
    );
  try {
    invariant(
      argv.length > 0,
      "usage",
      "Choose a command; run silvermoon --help.",
    );
    // Validate incompatible presentation options before any command can mutate.
    invariant(
      !(argv.includes("--json") && argv.includes("--audience")),
      "usage",
      "--json and --audience are mutually exclusive.",
    );
    await program.parseAsync([...argv], { from: "user" });
    return exit;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2;
    const code = io.signal?.aborted
      ? "cancelled"
      : error instanceof SilvermoonError
        ? error.code
        : "execution";
    io.stderr.write(
      JSON.stringify({
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      }) + "\n",
    );
    return code === "usage" ? 2 : 1;
  }
}
