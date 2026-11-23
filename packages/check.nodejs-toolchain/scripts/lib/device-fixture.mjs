import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

const npmShim = String.raw`:: Created by npm, please don't edit manually.
@ECHO OFF

SETLOCAL

SET "NODE_EXE=%~dp0\node.exe"
IF NOT EXIST "%NODE_EXE%" (
  SET "NODE_EXE=node"
)

SET "NPM_PREFIX_JS=%~dp0\node_modules\npm\bin\npm-prefix.js"
SET "NPM_CLI_JS=%~dp0\node_modules\npm\bin\npm-cli.js"
FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (
  SET "NPM_PREFIX_NPM_CLI_JS=%%F\node_modules\npm\bin\npm-cli.js"
)
IF EXIST "%NPM_PREFIX_NPM_CLI_JS%" (
  SET "NPM_CLI_JS=%NPM_PREFIX_NPM_CLI_JS%"
)

"%NODE_EXE%" "%NPM_CLI_JS%" %*`;

export async function deviceFixture(owned) {
  const windows = process.platform === "win32";
  const root = join(owned, "nvm");
  const version = process.version.slice(1);
  const installation = windows
    ? join(root, `v${version}`)
    : join(root, "versions", "node", `v${version}`);
  const binaries = windows ? installation : join(installation, "bin");
  const tools = join(owned, "tools");
  const temp = join(owned, "temp");
  await Promise.all(
    [binaries, tools, temp].map((path) => mkdir(path, { recursive: true })),
  );
  const node = join(binaries, windows ? "node.exe" : "node");
  await copyFile(process.execPath, node);
  await chmod(node, 0o755);
  const npm = windows
    ? join(installation, "node_modules", "npm", "bin")
    : join(installation, "lib", "node_modules", "npm", "bin");
  await mkdir(npm, { recursive: true });
  await writeFile(
    join(npm, "npm-cli.js"),
    'process.stdout.write("11.20.0\\n");\n',
  );
  await writeFile(
    join(npm, "npm-prefix.js"),
    `process.stdout.write(${JSON.stringify(installation)});\n`,
  );
  if (windows) {
    await writeFile(join(binaries, "npm.cmd"), npmShim);
  } else {
    await writeFile(
      join(npm, "npm-cli.js"),
      '#!/usr/bin/env node\nprocess.stdout.write("11.20.0\\n");\n',
    );
    await chmod(join(npm, "npm-cli.js"), 0o755);
    const { symlink } = await import("node:fs/promises");
    await symlink(join(npm, "npm-cli.js"), join(binaries, "npm"));
  }
  const responses = {
    nvm: {
      version: "2.0.0\n",
      root: `Current Root: ${root}\n`,
      list: `* ${version} (Currently using 64-bit executable)\n`,
      "config get auto_installed_modules": "pnpm,nrm@1.2.6\n",
    },
    pnpm: { "--version": "11.28.12\n" },
    nrm: {
      "--version": "1.2.6\n",
      ls: "* npm --- https://registry.npmjs.org/\nextra --- https://registry.example.test/\n",
    },
  };
  for (const [name, values] of Object.entries(responses)) {
    const directory = join(owned, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name, version: name === "nrm" ? "1.2.6" : "0.0.0" }),
    );
    await writeFile(
      join(directory, "cli.js"),
      `const responses=${JSON.stringify(values)};const key=process.argv.slice(2).join(" ");if(!Object.hasOwn(responses,key))throw new Error("Unexpected fixture command");process.stdout.write(responses[key]);\n`,
    );
    const target = join(directory, "cli.js");
    const source = windows
      ? `@"${node}" "%~dp0\\..\\node_modules\\${name}\\cli.js" %*\r\n`
      : `#!/bin/sh\nbasedir=\${0%/*}\nexec "${node}" "$basedir/../node_modules/${name}/cli.js" "$@"\n`;
    await writeFile(join(tools, windows ? `${name}.cmd` : name), source, {
      mode: 0o755,
    });
    if (name === "nrm" && !windows) {
      const { unlink, symlink } = await import("node:fs/promises");
      await unlink(join(tools, name));
      await writeFile(
        target,
        `#!/usr/bin/env node\nconst responses=${JSON.stringify(values)};process.stdout.write(responses[process.argv.slice(2).join(" ")]);\n`,
      );
      await chmod(target, 0o755);
      await symlink(target, join(tools, name));
    }
  }
  await writeFile(
    join(root, "nvm.sh"),
    `nvm() { case "$1" in --version) printf '0.40.4\\n';; which) printf '%s\\n' '${node.replaceAll("'", "'\\''")}';; *) return 2;; esac; }\n`,
  );
  const defaults = join(root, "default-packages");
  await writeFile(defaults, "pnpm\nnrm@1.2.6\n");
  const npmrc = join(owned, ".npmrc");
  await writeFile(npmrc, "registry=https://registry.npmjs.org/\n");
  return {
    environment: {
      PATH: [binaries, tools].join(delimiter),
      ...(windows
        ? {
            PATHEXT: ".EXE;.CMD",
            USERPROFILE: owned,
            APPDATA: owned,
            LOCALAPPDATA: owned,
          }
        : {}),
      HOME: owned,
      NVM_DIR: root,
      NVM_HOME: root,
      TEMP: temp,
      TMP: temp,
      npm_config_userconfig: npmrc,
      npm_config_globalconfig: join(owned, "global.npmrc"),
    },
    configurationFiles: [defaults, npmrc],
  };
}
