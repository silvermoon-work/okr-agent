# Project Guidelines

## Development

- This project uses pnpm workspaces and Turborepo. Keep executable apps under
  `apps/` and reusable packages under `packages/`.
- Use Node.js 22.13 or newer and pnpm 11.22 or newer.
- Install dependencies with `pnpm install`.
- Run `pnpm check` before submitting changes.
- Keep shared third-party versions in the pnpm catalog and internal workspace
  dependencies on `workspace:*`.
- Keep each workspace's build, lint, test, and typecheck scripts aligned with
  `turbo.json`.

## Skills

- Manage project skills with `npx skills`.
- Keep all project skills under `.agent/skills/<skill-name>/`, with each skill's
  `SKILL.md` in its directory.

## Silvermoon

- Use the device-level Silvermoon CLI and personal skill registration, not a
  project dependency or repository-local Silvermoon skill.
- Project content defaults to Simplified Chinese (`zh-CN`).
- Start with `silvermoon whats-next --audience agent --language zh-CN` and
  follow its reported next action.
- Validate metadata with
  `silvermoon check --worktree --audience agent --language zh-CN` before staging
  and `silvermoon check --staged --audience agent --language zh-CN` before
  committing.

## Publishing

- Keep repository release knowledge here, not in a project skill. See
  [README](README.md#publish-one-package) for setup and commands.
- Release one explicitly mapped package with `<package-id>-v<version>` tags.
  Never batch-publish workspaces or automatically release dependencies.
- Update the package mapping in `scripts/release-packages.js` when renaming or
  adding a publishable library. Keep the root, apps, and preset examples
  private.
- Require the tag's package identity and exact version to match both the tagged
  commit's manifest and the packed manifest, including prerelease suffixes.
- Publish only commits reachable from main with successful exact-commit main
  push CI. Keep the versioned CI aggregate and verifier arguments aligned.
- Build the selected package and its dependencies, then pack the selected
  package once with lifecycle hooks disabled. Validate and publish that same
  tarball.
- Internal runtime and peer dependencies must have matching versions already on
  npm. Publish missing dependencies separately before tagging the dependent
  package.
- Use npm Trusted Publishing, not stored tokens. Manual workflow runs are dry
  runs only. Never push release tags or publish without explicit authorization.
- Release tags are immutable. Retry a failed pre-publication run without moving
  its tag; an existing npm version must block publication.
