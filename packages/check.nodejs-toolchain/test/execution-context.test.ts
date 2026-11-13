import { delimiter, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  absoluteHostPath,
  captureExecutionEnvironment,
  executionEnvironment,
  validateExecutionEnvironment,
  type ExecutionEnvironment,
} from "../src/execution-context.js";

const root = resolve(".");
const selected: ExecutionEnvironment = {
  path: [root],
  ...(process.platform === "win32" ? { pathExtensions: [".EXE", ".CMD"] } : {}),
};
describe("authorized execution context", () => {
  it("maps only the closed fields and trusted Worker system values", () => {
    const context: ExecutionEnvironment = {
      ...selected,
      home: root,
      xdgConfigHome: root,
      nvmDir: root,
      nvmHome: root,
      nvmSymlink: root,
      pnpmHome: root,
      npmConfig: {
        registry: "https://example.test/",
        userConfig: root,
        globalConfig: root,
        prefix: root,
        global: false,
        location: "project",
      },
    };
    const result = executionEnvironment(context, {});
    expect(result).toMatchObject({
      PATH: root,
      HOME: root,
      NVM_DIR: root,
      npm_config_registry: "https://example.test/",
      npm_config_global: "false",
      npm_config_location: "project",
    });
    expect(result.NODE_OPTIONS).toBeUndefined();
    expect(result.NODE_PATH).toBeUndefined();
    expect(result.SystemRoot).toBeUndefined();
  });
  it.each([
    { path: [] },
    { path: ["relative"] },
    { path: [root], NODE_OPTIONS: "--require secret" },
    { ...selected, token: "secret" },
    { ...selected, home: "relative" },
    { ...selected, npmConfig: {} },
    {
      ...selected,
      npmConfig: { registry: "https://user:secret@example.test/" },
    },
    { ...selected, npmConfig: { registry: "https://${REGISTRY_HOST}/" } },
    { ...selected, npmConfig: { userConfig: "relative" } },
    { ...selected, npmConfig: { location: "unknown" } },
    { ...selected, pathExtensions: [".EXE", ".EXE"] },
  ])("rejects unsupported, ambiguous or sensitive context %j", (value) => {
    expect(() => {
      validateExecutionEnvironment(value);
    }).toThrow();
  });
  it("rejects platform conflicts and Windows drive-relative paths", () => {
    expect(() => {
      validateExecutionEnvironment({ path: ["C:\\Tools"] }, "win32");
    }).toThrow();
    expect(() => {
      validateExecutionEnvironment(
        { path: ["/tools"], pathExtensions: [".EXE"] },
        "linux",
      );
    }).toThrow();
    expect(() => {
      validateExecutionEnvironment(
        { path: ["/tools"], userProfile: "/home" },
        "linux",
      );
    }).toThrow();
    expect(absoluteHostPath("C:tools", "win32")).toBe(false);
    expect(absoluteHostPath("\\tools", "win32")).toBe(false);
    expect(absoluteHostPath("C:\\tools", "linux")).toBe(false);
  });
  it("captures approved values only, rejects alias conflicts and does not normalize away unsafe PATH", () => {
    const source = {
      PATH: [root, root].join(delimiter),
      ...(process.platform === "win32" ? { PATHEXT: ".EXE;.CMD" } : {}),
      HOME: root,
      npm_config_registry: "https://example.test/",
      SECRET_TOKEN: "must-not-be-copied",
      NODE_OPTIONS: "--require unknown",
    };
    const context = captureExecutionEnvironment(source);
    expect(context.home).toBe(root);
    expect(context.path).toEqual([root, root]);
    expect(JSON.stringify(context)).not.toContain("must-not-be-copied");
    expect(JSON.stringify(context)).not.toContain("NODE_OPTIONS");
    expect(() => {
      captureExecutionEnvironment({ ...source, Path: `${root}other` });
    }).toThrow("Conflicting");
    expect(() => {
      captureExecutionEnvironment({
        ...source,
        NPM_CONFIG_REGISTRY: "https://other.test",
      });
    }).toThrow("Conflicting");
    expect(() => {
      captureExecutionEnvironment({ ...source, PATH: `${root}${delimiter}` });
    }).toThrow();
  });

  it.each([
    {},
    { PATH: "C:\\Tools" },
    { PATH: "C:\\Tools", PATHEXT: ".EXE;.VBS" },
    { PATH: "C:\\Tools", PATHEXT: ".EXE", npm_config_global: "1" },
    { PATH: "C:\\Tools", PATHEXT: ".EXE", npm_config_location: "workspace" },
  ])(
    "rejects incomplete or unsupported captured Windows startup context %j",
    (source) => {
      expect(() => captureExecutionEnvironment(source, "win32")).toThrow();
    },
  );

  it("round-trips approved npm configuration paths and ignores Windows-only paths on POSIX", () => {
    const captured = captureExecutionEnvironment({
      PATH: root,
      ...(process.platform === "win32" ? { PATHEXT: ".EXE;.CMD" } : {}),
      npm_config_userconfig: resolve("user.npmrc"),
      npm_config_globalconfig: resolve("global.npmrc"),
      npm_config_prefix: root,
      npm_config_global: "true",
      npm_config_location: "user",
    });
    expect(executionEnvironment(captured, {})).toMatchObject({
      npm_config_userconfig: resolve("user.npmrc"),
      npm_config_globalconfig: resolve("global.npmrc"),
      npm_config_prefix: root,
      npm_config_global: "true",
      npm_config_location: "user",
    });
    expect(
      captureExecutionEnvironment(
        {
          PATH: "/usr/bin",
          USERPROFILE: "not-an-authorized-posix-path",
          APPDATA: "not-an-authorized-posix-path",
          LOCALAPPDATA: "not-an-authorized-posix-path",
        },
        "linux",
      ),
    ).toEqual({ path: ["/usr/bin"] });
  });

  it("rejects unsafe trusted Worker system paths rather than forwarding them", () => {
    expect(() =>
      executionEnvironment(selected, { SystemRoot: "relative" }),
    ).toThrow("trusted Worker");
    expect(() =>
      executionEnvironment(selected, { WINDIR: "relative" }),
    ).toThrow("trusted Worker");
    expect(
      executionEnvironment(selected, { SystemRoot: root, WINDIR: root }),
    ).toMatchObject({
      SystemRoot: root,
      WINDIR: root,
    });
  });
});
