import { access, lstat, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { invariant, userLanguage } from "./domain.js";
import { absent, readRegular } from "./repository.js";

export interface Device {
  readonly entry: string;
  readonly home: string;
  readonly path: string;
}
export function currentDevice(): Device {
  return {
    entry: fileURLToPath(new URL("../dist/bin.js", import.meta.url)),
    home: homedir(),
    path: process.env.PATH ?? "",
  };
}
export async function deviceLanguage(
  device: Pick<Device, "home">,
): Promise<string | undefined> {
  const config = join(device.home, ".config", "silvermoon", "config.yaml");
  return (await absent(config))
    ? undefined
    : userLanguage(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readRegular(config),
        ),
      );
}
export async function inspectDevice(device: Device): Promise<void> {
  await deviceLanguage(device);
  const entry = await realpath(device.entry);
  const root = resolve(dirname(entry), "..");
  const manifest: unknown = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  invariant(
    manifest !== null &&
      typeof manifest === "object" &&
      "name" in manifest &&
      manifest.name === "@silvermoon-work/silvermoon" &&
      "bin" in manifest &&
      JSON.stringify(manifest.bin) ===
        JSON.stringify({ silvermoon: "./dist/bin.js" }),
    "device",
    "Running entry must belong to the scoped Silvermoon installation.",
  );
  invariant(
    entry === join(root, "dist", "bin.js"),
    "device",
    "Runtime entry is not the installed canonical bin.",
  );
  const canonicalSkill = await realpath(join(root, "skills", "silvermoon"));
  let skillReady = false;
  for (const host of [".agents", ".copilot"]) {
    const skill = join(device.home, host, "skills", "silvermoon");
    if (await absent(skill)) continue;
    invariant(
      (await lstat(skill)).isSymbolicLink(),
      "device",
      "Personal skill must link to the current installation, not be a copy.",
    );
    if ((await realpath(skill)) === canonicalSkill) skillReady = true;
  }
  invariant(
    skillReady,
    "device",
    "Link the installation's canonical skills/silvermoon at a personal discovery path.",
  );
  const suffixes =
    process.platform === "win32" ? [".cmd", ".ps1", ".exe", ""] : [""];
  let runtimeReady = false;
  for (const directory of device.path.split(delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const command = join(directory, `silvermoon${suffix}`);
      if (await absent(command)) continue;
      const resolved = await realpath(command);
      if (resolved === entry) runtimeReady = true;
      else if (!suffix.endsWith("exe")) {
        const content = await readFile(command, "utf8");
        const normalized = content.replaceAll("\\", "/").toLowerCase();
        const relative = `${root.replaceAll("\\", "/").toLowerCase()}/dist/bin.js`;
        if (normalized.includes(relative)) runtimeReady = true;
        else if (
          normalized.includes(
            "node_modules/@silvermoon-work/silvermoon/dist/bin.js",
          )
        ) {
          for (const prefix of [directory, resolve(directory, "..", "lib")]) {
            const installed = join(
              prefix,
              "node_modules",
              "@silvermoon-work",
              "silvermoon",
              "dist",
              "bin.js",
            );
            if (
              !(await absent(installed)) &&
              (await realpath(installed)) === entry
            )
              runtimeReady = true;
          }
        }
      }
      if (process.platform !== "win32") await access(command, constants.X_OK);
      break;
    }
    // The first discovered command owns PATH resolution.
    if (runtimeReady) break;
    const found = await Promise.all(
      suffixes.map((suffix) => absent(join(directory, `silvermoon${suffix}`))),
    );
    if (found.some((missing) => !missing)) break;
  }
  invariant(
    runtimeReady,
    "device",
    "PATH must resolve silvermoon to this exact installation, not the legacy tool.",
  );
}
