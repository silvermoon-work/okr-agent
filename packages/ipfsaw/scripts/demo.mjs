import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { packRenderer, importRendererCar } from "../dist/index.js";
import { typescriptProjectSpec } from "@silvermoon-work/check-bundle-viewer";

const directory = resolve(".ipfsaw-demo");
await mkdir(directory, { recursive: false });
const files = new Map();
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory())
      await collect(join(directory, entry.name), path + "/");
    else if (entry.isFile())
      files.set(path, await readFile(join(directory, entry.name)));
    else throw new Error("Renderer directory contains a non-file entry.");
  }
}
await collect(resolve("../check-bundle-viewer/dist/renderer"));
const check = await packRenderer(files);
const note = await packRenderer(
  new Map([
    [
      "ipfsaw.renderer.json",
      Buffer.from(
        JSON.stringify({
          protocol: "ipfsaw-renderer/v1",
          entry: "renderer.js",
          styles: [],
        }),
      ),
    ],
    [
      "renderer.js",
      Buffer.from(
        `let container; function show(value, context) { container.textContent = "Note: " + value.title + " (revision " + context.revision + ")"; } export default { mount(target, value, context) { container = target; show(value, context); }, update: show, dispose() { container.replaceChildren(); } };`,
      ),
    ],
  ]),
);
const dataDir = join(directory, "content");
const store = new IpfsStore({ backend: "local", dataDir });
try {
  for (const [name, bundle] of [
    ["check", check],
    ["note", note],
  ]) {
    await importRendererCar(store, bundle.car);
    await writeFile(join(directory, `${name}.car`), bundle.car, { flag: "wx" });
    await writeFile(join(directory, `${name}.cid`), bundle.cid + "\n", {
      flag: "wx",
    });
  }
} finally {
  await store.close();
}
const json = (name, value) =>
  writeFile(join(directory, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
await json("task-content.json", { backend: "local", dataDir });
await mkdir(join(directory, "state"));
await writeFile(
  join(directory, "state", "config.json"),
  JSON.stringify(
    {
      version: 1,
      openBrowser: false,
      renderers: {
        "urn:ipfsaw:check-bundle:1": check.cid,
        "urn:ipfsaw:note:1": note.cid,
      },
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
await json("check.json", {
  $schema: "urn:ipfsaw:check-bundle:1",
  ...typescriptProjectSpec,
});
await json("note.json", {
  $schema: "urn:ipfsaw:note:1",
  title: "An independent renderer",
});
console.log(
  `Controlled local demo: ${directory}\nCheck: ${check.cid}\nNote: ${note.cid}\nSet TASK_CONTENT_CONFIG to ${join(directory, "task-content.json")}; use dist/bin.js .ipfsaw-demo/check.json --data-dir .ipfsaw-demo/state --no-open`,
);
