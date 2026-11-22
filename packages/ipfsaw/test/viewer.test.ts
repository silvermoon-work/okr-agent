import { CarWriter } from "@ipld/car";
import { CID } from "multiformats/cid";
import { describe, expect, it } from "vitest";
import { loadViewer } from "../src/viewer.js";
import {
  rendererFiles,
  rendererFixture,
  rawDirectory,
  taskFixture,
} from "./helpers.js";

describe("explicit Viewer protocol selection", () => {
  it("recognizes renderer CID/CAR and browser Task CAR without executing their scripts or importing content", async () => {
    const renderer = await rendererFixture(
      "throw new Error('never run in Node'); export default {};",
    );
    const task = await taskFixture();
    try {
      for (const source of [{ cid: renderer.cid }, { car: renderer.car }]) {
        const loaded = await loadViewer(renderer.store, source);
        expect(loaded.type).toBe("renderer");
        expect(loaded.bundle.cid).toBe(renderer.cid);
      }
      const loaded = await loadViewer(renderer.store, { car: task.car });
      try {
        expect(loaded.type).toBe("task");
        expect(loaded.bundle.cid).toBe(task.cid);
      } finally {
        if (loaded.type === "task") await loaded.bundle.close();
      }
      await expect(renderer.store.read(task.cid)).rejects.toThrow();
      expect((await renderer.store.read(renderer.cid)).type).toBe("directory");
    } finally {
      await renderer.store.close();
    }
  });

  it("rejects missing, ambiguous and multiple-root manifests rather than trying an execution fallback", async () => {
    const renderer = await rendererFixture();
    const missing = await rawDirectory(
      new Map([["document.json", Buffer.from("{}")]]),
    );
    const ambiguous = await rawDirectory(
      new Map([
        ...rendererFiles(),
        ["task.yaml", Buffer.from("name: ambiguous")],
      ]),
    );
    try {
      for (const fixture of [missing, ambiguous])
        await expect(
          loadViewer(fixture.store, { cid: fixture.cid }),
        ).rejects.toThrow("exactly one");
      const { writer, out } = CarWriter.create([
        CID.parse(renderer.cid),
        CID.parse(missing.cid),
      ]);
      const bytes = new Response(
        new ReadableStream({
          async start(controller) {
            for await (const part of out) controller.enqueue(part);
            controller.close();
          },
        }),
      ).arrayBuffer();
      await writer.close();
      await expect(
        loadViewer(renderer.store, { car: new Uint8Array(await bytes) }),
      ).rejects.toThrow("one Viewer CAR root");
      await expect(
        loadViewer(renderer.store, { car: Uint8Array.of(1, 2, 3) }),
      ).rejects.toThrow();
    } finally {
      await renderer.store.close();
      await missing.store.close();
      await ambiguous.store.close();
    }
  });
});
