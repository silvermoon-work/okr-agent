import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentDevice,
  deviceLanguage,
  inspectDevice,
  inspectInstallation,
  inspectPersonalSkill,
} from "../src/device.js";
import { scratch } from "./fixtures.js";

async function fixture() {
  const directory = await scratch();
  const root = join(directory, "runtime"),
    home = join(directory, "home"),
    bin = join(directory, "bin");
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, "skills", "silvermoon"), { recursive: true });
  await mkdir(join(home, ".agents", "skills"), { recursive: true });
  await mkdir(bin);
  const entry = join(root, "dist", "bin.js");
  await writeFile(entry, "#!/usr/bin/env node\n", { mode: 0o755 });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "@silvermoon-work/silvermoon",
      bin: { silvermoon: "./dist/bin.js" },
    }),
  );
  const skill = join(home, ".agents", "skills", "silvermoon");
  await symlink(join(root, "skills", "silvermoon"), skill, "junction");
  const command = join(
    bin,
    process.platform === "win32" ? "silvermoon.cmd" : "silvermoon",
  );
  await writeFile(command, `#!/bin/sh\nnode "${entry}"\n`, { mode: 0o755 });
  return {
    root,
    home,
    bin,
    entry,
    command,
    skill,
    device: { home, entry, path: bin },
  };
}

describe("device inspection with owned filesystem fixtures, never executed shims", () => {
  it("recognizes the running installation, first PATH command and personal link without executing anything", async () => {
    const { root, device } = await fixture();
    expect(await inspectInstallation(device)).toBe(root);
    await expect(inspectDevice(device)).resolves.toBeUndefined();
    expect(currentDevice().entry).toContain("bin.js");
  });
  it("uses user configuration only when present and rejects invalid encoding/schema", async () => {
    const { home, device } = await fixture();
    expect(await deviceLanguage(device)).toBeUndefined();
    const path = join(home, ".config", "silvermoon", "config.yaml");
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "version: 1\npreferredLanguage: fr-FR\n");
    expect(await deviceLanguage(device)).toBe("fr-FR");
    await writeFile(path, "version: 999\n");
    await expect(deviceLanguage(device)).rejects.toThrow();
    await writeFile(path, Uint8Array.of(255));
    await expect(deviceLanguage(device)).rejects.toThrow();
  });
  it.each(["manifest", "entry", "missing-entry"] as const)(
    "rejects an invalid installation %s",
    async (kind) => {
      const { root, entry, device } = await fixture();
      if (kind === "manifest")
        await writeFile(
          join(root, "package.json"),
          JSON.stringify({ name: "legacy", bin: {} }),
        );
      if (kind === "entry") {
        const other = join(root, "dist", "other.js");
        await writeFile(other, "not canonical");
        await expect(
          inspectInstallation({ ...device, entry: other }),
        ).rejects.toThrow(/canonical/);
      } else {
        if (kind === "missing-entry") await rm(entry);
        await expect(inspectInstallation(device)).rejects.toThrow();
      }
    },
  );
  it("never accepts a later installed command when the first PATH result is legacy", async () => {
    const { device } = await fixture();
    const legacy = await scratch();
    await writeFile(
      join(
        legacy,
        process.platform === "win32" ? "silvermoon.cmd" : "silvermoon",
      ),
      "#!/bin/sh\nlegacy\n",
      { mode: 0o755 },
    );
    await expect(
      inspectInstallation({
        ...device,
        path: legacy + delimiter + device.path,
      }),
    ).rejects.toThrow(/legacy/);
    expect(
      await inspectInstallation({
        ...device,
        path: (await scratch()) + delimiter + device.path,
      }),
    ).toContain("runtime");
    await expect(inspectInstallation({ ...device, path: "" })).rejects.toThrow(
      /PATH/,
    );
  });
  it("recognizes symlinked commands and installed package-manager shim targets", async () => {
    const { root, entry, command, bin, device } = await fixture();
    await rm(command);
    await symlink(entry, command);
    expect(await inspectInstallation(device)).toBe(root);
    await rm(command);
    const installed = join(
      bin,
      "node_modules",
      "@silvermoon-work",
      "silvermoon",
      "dist",
    );
    await mkdir(installed, { recursive: true });
    await symlink(entry, join(installed, "bin.js"));
    await writeFile(
      command,
      "#!/bin/sh\nnode node_modules/@silvermoon-work/silvermoon/dist/bin.js\n",
      { mode: 0o755 },
    );
    expect(await inspectInstallation(device)).toBe(root);
    await rm(join(installed, "bin.js"));
    await expect(inspectInstallation(device)).rejects.toThrow(/PATH/);
  });
  it("requires canonical personal links, rejecting copies, missing and stale targets", async () => {
    const { root, home, skill, device } = await fixture();
    await rm(skill);
    await expect(inspectPersonalSkill(device, root)).rejects.toThrow(/Link/);
    await mkdir(skill);
    await expect(inspectPersonalSkill(device, root)).rejects.toThrow(
      /not be a copy/,
    );
    await rm(skill, { recursive: true });
    await symlink(await scratch(), skill, "junction");
    await expect(inspectPersonalSkill(device, root)).rejects.toThrow(
      /canonical/,
    );
    await rm(skill);
    const copilot = join(home, ".copilot", "skills", "silvermoon");
    await mkdir(join(copilot, ".."), { recursive: true });
    await symlink(join(root, "skills", "silvermoon"), copilot, "junction");
    await expect(inspectPersonalSkill(device, root)).resolves.toBeUndefined();
  });
});
