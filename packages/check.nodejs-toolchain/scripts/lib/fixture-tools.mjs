import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

export async function fixtureTools(owned) {
  const modules = join(owned, "tools", "node_modules");
  const bins = join(modules, ".bin");
  await mkdir(bins, { recursive: true });
  await writeFile(
    join(bins, process.platform === "win32" ? "node.cmd" : "node"),
    process.platform === "win32"
      ? `@"${process.execPath}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "$@"\n`,
    { mode: 0o755 },
  );
  for (const [name, responses] of Object.entries({
    npm: {
      "--version": "10.8.1\n",
      "config get registry": "https://fixture.example.test/\n",
    },
    pnpm: {
      "--version": "11.28.11\n",
      "config get registry": "https://fixture.example.test/\n",
      "config get globalconfig": `${join(owned, "global.npmrc")}\n`,
    },
    nrm: {
      "--version": "1.2.6\n",
      ls: "owned ---- https://registered.example.test/\nextra ---- https://extra.example.test/\n",
    },
  })) {
    const root = join(modules, name);
    await mkdir(root);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name, version: name === "nrm" ? "1.2.6" : "0.0.0" }),
    );
    await writeFile(
      join(root, "cli.js"),
      `const responses=${JSON.stringify(responses)};
const key=process.argv.slice(2).join(" ");
if(!Object.hasOwn(responses,key)) throw new Error("Unexpected fixture command: "+key);
process.stdout.write(responses[key]);\n`,
    );
    await writeFile(
      join(bins, process.platform === "win32" ? `${name}.cmd` : name),
      process.platform === "win32"
        ? `@"${process.execPath}" "%~dp0\\..\\${name}\\cli.js" %*\r\n`
        : `#!/bin/sh\nbasedir=\${0%/*}\nbasedir_abs="$basedir"\nexec "$basedir/node" "$basedir_abs"/'../${name}/cli.js' "$@"\n`,
      { mode: 0o755 },
    );
  }
  return bins;
}
