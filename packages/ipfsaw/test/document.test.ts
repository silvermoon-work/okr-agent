import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  boundedRead,
  DocumentError,
  InputError,
  limits,
  parseDocument,
  readDocument,
  schemaUri,
} from "../src/document.js";
import { fixtureDirectory } from "./helpers.js";

const bytes = (value: string) => Buffer.from(value);
describe("bounded, JSON-compatible document input", () => {
  it("reads JSON/YAML, exact URI and shared noncyclic aliases", () => {
    expect(
      parseDocument(
        bytes('{"$schema":"urn:test:1","n":1,"yes":true,"none":null}'),
        ".json",
      ).document.n,
    ).toBe(1);
    expect(
      parseDocument(
        bytes("$schema: urn:test:1\none: &one {title: hello}\ntwo: *one"),
        ".yml",
      ).document.two,
    ).toEqual({ title: "hello" });
    expect(schemaUri("https://example.test/a/")).toBe(
      "https://example.test/a/",
    );
    for (const uri of ["", " urn:test:1", "relative"])
      expect(() => schemaUri(uri)).toThrow();
  });
  it.each([
    ["{secret-body", ".json", "JSON"],
    ["[]", ".json", "root"],
    ["null", ".json", "root"],
    ['{"$schema":1}', ".json", "root"],
    ["$schema: urn:test:1\n---\nother: value", ".yaml", "exactly one"],
    ["$schema: urn:test:1\nnumber: .inf", ".yaml", "finite"],
    ["$schema: urn:test:1\nnumber: .nan", ".yaml", "finite"],
    ["$schema: urn:test:1\nnode: &a {child: *a}", ".yaml", "acyclic"],
    [
      "$schema: urn:test:1\nnode: !!js/function 'function() {}'",
      ".yaml",
      "Invalid YAML",
    ],
    ["$schema: urn:test:1\nnode: [", ".yaml", "Invalid YAML"],
    ["$schema: urn:test:1\nx: 1\nx: 2", ".yaml", "Invalid YAML"],
    ["", ".yaml", "exactly one"],
  ])(
    "rejects unsafe/invalid %s without echoing source",
    (source, extension, message) => {
      expect(() => parseDocument(bytes(source), extension)).toThrow(message);
      try {
        parseDocument(bytes(source), extension);
      } catch (error) {
        expect(String(error)).not.toContain("secret-body");
      }
    },
  );
  it("limits source, expanded aliases, and nesting at bounded thresholds", () => {
    const source = '{"$schema":"urn:test:1","text":""}';
    const exact = source.replace(
      '""',
      `"${"a".repeat(limits.document - Buffer.byteLength(source))}"`,
    );
    expect(parseDocument(bytes(exact), ".json").schema).toBe("urn:test:1");
    expect(() => parseDocument(bytes(exact + " "), ".json")).toThrow("1 MiB");
    const expansion = `$schema: urn:test:1\na: &a "${"x".repeat(20000)}"\nb: [${Array.from({ length: 60 }, () => "*a").join(",")}]`;
    expect(() => parseDocument(bytes(expansion), ".yaml")).toThrow("Expanded");
    const nesting = `$schema: urn:test:1\nn: ${"[".repeat(102)}0${"]".repeat(102)}`;
    expect(() => parseDocument(bytes(nesting), ".yaml")).toThrow("depth");
    const aliasBomb =
      "$schema: urn:test:1\na: &a [1,2]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: [" +
      Array.from({ length: 20 }, () => "*b").join(",") +
      "]";
    expect(() => parseDocument(bytes(aliasBomb), ".yaml")).toThrow("aliases");
    expect(() => parseDocument(Uint8Array.of(255), ".json")).toThrow();
  });
  it("bounds disk reads, handles directories/missing files and validates extensions", async () => {
    const fixture = await fixtureDirectory();
    try {
      const path = join(fixture.directory, "doc.JSON");
      await writeFile(path, '{"$schema":"urn:test:1"}');
      expect((await readDocument(path)).schema).toBe("urn:test:1");
      expect((await boundedRead(path, 24)).length).toBe(24);
      await expect(boundedRead(path, 23)).rejects.toThrow("byte limit");
      await expect(
        readDocument(join(fixture.directory, "missing.yaml")),
      ).rejects.toThrow("Cannot read");
      await expect(readDocument("bad.txt")).rejects.toThrow(".yaml");
      await expect(readDocument("bad.txt")).rejects.toBeInstanceOf(InputError);
      await writeFile(path, "{");
      await expect(readDocument(path)).rejects.toThrow("JSON");
      await writeFile(path, '{"$schema":"bad"}');
      await expect(readDocument(path)).rejects.toThrow("URI");
      await expect(readDocument(path)).rejects.toBeInstanceOf(DocumentError);
      await mkdir(join(fixture.directory, "folder.yaml"));
      await expect(
        readDocument(join(fixture.directory, "folder.yaml")),
      ).rejects.toThrow("Cannot read");
    } finally {
      await fixture.cleanup();
    }
  });
});
