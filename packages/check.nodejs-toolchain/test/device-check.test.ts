import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { executeCheck } from "@silvermoon-work/check-task-sdk";
import { type Input, type Tool } from "../src/contract.js";
import { type Device, type ToolFact } from "../src/device.js";
import { toolchainCheckpoints } from "../src/inspect.js";
import { packageRequirements, resolvePolicy } from "../src/policy.js";
import { managed, paired } from "../src/provenance.js";
import type { Host } from "../src/legacy/inspect.js";

const root = resolve("fixture-nvm");
const installation = join(root, "v22.15.0");
const signal = () => new AbortController().signal;
function fixture() {
  const entries = new Map<Tool, ToolFact>();
  for (const name of ["nvm", "node", "npm", "pnpm", "nrm"] as const)
    entries.set(name, {
      executable: join(installation, `${name}.exe`),
      realPath: join(installation, `${name}.exe`),
      args: [],
      version: name === "nrm" ? "1.2.6" : "22.15.0",
    });
  const device: Device = {
    directory: resolve("fixture-probe"),
    host: {
      platform: "win32",
      env: { NVM_DIR: root },
      locate: vi.fn((name: Tool) => Promise.resolve(entries.get(name))),
      canonical: vi.fn((path: string) => Promise.resolve(resolve(path))),
      assertRegistryContext: vi.fn(() => Promise.resolve()),
      npmLocation: vi.fn(() =>
        Promise.resolve({
          cli: join(installation, "node_modules", "npm", "bin", "npm-cli.js"),
          node: entries.get("node")!.realPath!,
        }),
      ),
      run: vi.fn<Host["run"]>((entry, args) =>
        Promise.resolve({
          code: 0,
          stdout:
            args[0] === "root"
              ? `Current Root: ${root}`
              : args[0] === "list"
                ? "* 22.15.0 (Currently using 64-bit executable)\n23.0.0\n"
                : entries.get(
                    [...entries].find(
                      ([, value]) => value.executable === entry.executable,
                    )![0],
                  )!.version,
        }),
      ),
    },
    defaultPackages: vi.fn(() => Promise.resolve(["pnpm", "nrm@1.2.6"])),
    registryState: vi.fn(() =>
      Promise.resolve({
        registrations: new Map([["npm", "https://registry.npmjs.org"]]),
        selectedUrl: "https://registry.npmjs.org",
      }),
    ),
  };
  return { device, entries };
}
async function check(input: Input = {}, device = fixture().device) {
  const aborted = signal();
  return executeCheck({
    checkpoints: toolchainCheckpoints(input, aborted, device),
    target: input,
    signal: aborted,
  });
}

describe("device policy", () => {
  it("keeps pinned baseline packages and merges normalized registry declarations without weakening policy", () => {
    const policy = resolvePolicy({
      defaultPackages: ["nrm", "typescript"],
      additionalRegistries: [
        { name: "npm", url: "https://REGISTRY.npmjs.org/" },
        { name: "company", url: "https://example.test/" },
        { name: "company", url: "https://example.test" },
      ],
      defaultRegistry: "company",
    });
    expect([...policy.requiredPackages]).toEqual([
      ["pnpm", undefined],
      ["nrm", "1.2.6"],
      ["typescript", undefined],
    ]);
    expect(policy.selectedUrl).toBe("https://example.test");
    expect(policy.requiredRegistries.size).toBe(2);
    expect(
      resolvePolicy({ defaultPackages: [], additionalRegistries: [] })
        .selectedName,
    ).toBe("npm");
  });

  it.each([
    { context: {} },
    { requirements: {} },
    { minimumVersions: { node: "^22" } },
    { defaultPackages: ["nrm@1.2.6"] },
    { defaultPackages: ["nrm", "nrm"] },
    { defaultRegistry: "absent" },
    { additionalRegistries: [{ name: "npm", url: "https://other.test" }] },
    {
      additionalRegistries: [
        { name: "x", url: "https://example.test/${SECRET}" },
      ],
    },
  ])("rejects invalid input or conflicts before tool probes: %j", (input) => {
    const { device } = fixture();
    expect(() =>
      toolchainCheckpoints(input as Input, signal(), device),
    ).toThrow();
    expect(device.host.locate).not.toHaveBeenCalled();
  });

  it("rejects ambiguous/unsupported package declarations rather than dropping them", () => {
    expect(() => packageRequirements(["--flag"])).toThrow("Unsupported");
    expect(() => packageRequirements(["nrm@1.2.6", "nrm@latest"])).toThrow(
      "Conflicting",
    );
    expect([
      ...packageRequirements(["@scope/tool@1.0.0", "pnpm", "pnpm"]),
    ]).toEqual([
      ["@scope/tool", "1.0.0"],
      ["pnpm", undefined],
    ]);
  });
});

describe("ordered device checkpoints", () => {
  it("passes the complete baseline without context and exposes only the ordered report", async () => {
    const { device } = fixture();
    expect(await check({}, device)).toMatchObject({
      pass: true,
      references: [],
    });
    expect(device.host.locate).toHaveBeenCalledTimes(5);
    expect(device.defaultPackages).toHaveBeenCalledOnce();
    expect(device.registryState).toHaveBeenCalledOnce();
  });

  it.each(["nvm", "node", "npm", "pnpm", "nrm"] as const)(
    "stops at the %s installation lower-bound failure",
    async (tool) => {
      const { device } = fixture();
      const result = await check(
        { minimumVersions: { [tool]: "999999999999999999999" } },
        device,
      );
      expect(result).toMatchObject({
        pass: false,
        problems: [
          {
            checkpoint: `${tool}-installation`,
            code: `${tool}-installation-version-valid`,
          },
        ],
      });
      expect(device.defaultPackages).not.toHaveBeenCalled();
    },
  );

  it("separates missing/unexecutable tools from unreadable versions and propagates probe faults", async () => {
    const { device, entries } = fixture();
    const nvm = entries.get("nvm")!;
    entries.delete("nvm");
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nvm-installation-executable" }],
    });
    entries.set("nvm", nvm);
    vi.mocked(device.host.run).mockResolvedValueOnce({ code: 1, stdout: "" });
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nvm-installation-executable" }],
    });
    vi.mocked(device.host.run).mockResolvedValueOnce({
      code: 0,
      stdout: "banner 1.2.3",
    });
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nvm-installation-version-valid" }],
    });
    vi.mocked(device.host.run).mockRejectedValueOnce(
      new Error("command timed out"),
    );
    await expect(check({}, device)).rejects.toThrow("timed out");
    expect(device.registryState).not.toHaveBeenCalled();
  });

  it("checks Node and npm management independently and pairing inside npm installation", async () => {
    const unknown = fixture();
    const selected = unknown.entries.get("node")!;
    unknown.entries.set("node", {
      executable: selected.executable,
      args: selected.args,
      version: selected.version,
    });
    expect(await check({}, unknown.device)).toMatchObject({
      problems: [{ code: "node-installation-managed-by-nvm" }],
    });
    const first = fixture();
    first.entries.set("node", {
      ...first.entries.get("node")!,
      realPath: resolve("outside", "node.exe"),
    });
    expect(await check({}, first.device)).toMatchObject({
      problems: [{ code: "node-installation-managed-by-nvm" }],
    });
    const second = fixture();
    vi.mocked(second.device.host.npmLocation).mockResolvedValue(undefined);
    expect(await check({}, second.device)).toMatchObject({
      problems: [{ code: "npm-installation-managed-by-nvm" }],
    });
    const third = fixture();
    vi.mocked(third.device.host.npmLocation).mockResolvedValue({
      cli: resolve("outside", "npm-cli.js"),
      node: third.entries.get("node")!.realPath!,
    });
    expect(await check({}, third.device)).toMatchObject({
      problems: [{ code: "npm-installation-managed-by-nvm" }],
    });
    const fourth = fixture();
    vi.mocked(fourth.device.host.npmLocation).mockResolvedValue({
      cli: join(root, "v23.0.0", "node_modules", "npm", "bin", "npm-cli.js"),
      node: join(root, "v23.0.0", "node.exe"),
    });
    expect(await check({}, fourth.device)).toMatchObject({
      problems: [{ code: "npm-installation-paired-with-node" }],
    });
  });

  it("requires automatic reinstallation configuration, not currently installed packages", async () => {
    const { device } = fixture();
    vi.mocked(device.defaultPackages).mockResolvedValueOnce(undefined);
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nvm-configuration-default-packages-configured" }],
    });
    vi.mocked(device.defaultPackages).mockResolvedValueOnce([
      "pnpm",
      "nrm@latest",
    ]);
    const wrongVersion = await check({}, device);
    expect(wrongVersion.pass).toBe(false);
    if (!wrongVersion.pass)
      expect(wrongVersion.problems[0].brief).toContain("nrm");
    const missingExtra = await check({ defaultPackages: ["extra"] }, device);
    expect(missingExtra.pass).toBe(false);
    if (!missingExtra.pass)
      expect(missingExtra.problems[0].brief).toContain("extra");
    vi.mocked(device.defaultPackages).mockResolvedValueOnce([
      "pnpm",
      "nrm@1.2.6",
      "extra@latest",
      "@scope/tool@1",
    ]);
    expect(await check({ defaultPackages: ["extra"] }, device)).toMatchObject({
      pass: true,
    });
  });

  it("collects registry differences, suppresses dependent selection errors and checks aliases by URL", async () => {
    const { device } = fixture();
    vi.mocked(device.registryState).mockResolvedValueOnce({
      registrations: new Map(),
    });
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nrm-configuration-registration-present" }],
    });
    vi.mocked(device.registryState).mockResolvedValueOnce({
      registrations: new Map([["npm", "https://wrong.test"]]),
    });
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nrm-configuration-registration-url-matched" }],
    });
    vi.mocked(device.registryState).mockResolvedValueOnce({
      registrations: new Map([["npm", "https://registry.npmjs.org"]]),
    });
    expect(await check({}, device)).toMatchObject({
      problems: [{ code: "nrm-configuration-default-registry-selected" }],
    });
    vi.mocked(device.registryState).mockResolvedValueOnce({
      registrations: new Map([
        ["npm", "https://registry.npmjs.org"],
        ["alias", "https://registry.npmjs.org"],
      ]),
      selectedUrl: "https://registry.npmjs.org",
    });
    expect(
      await check(
        {
          additionalRegistries: [
            { name: "alias", url: "https://registry.npmjs.org/" },
          ],
          defaultRegistry: "alias",
        },
        device,
      ),
    ).toMatchObject({ pass: true });
  });

  it("retains arbitrary-precision version equality and rejects unsupported platforms", async () => {
    expect(
      await check({ minimumVersions: { nvm: "00022.015.0" } }),
    ).toMatchObject({ pass: true });
    const { device } = fixture();
    Object.defineProperty(device.host, "platform", { value: "freebsd" });
    expect(() => toolchainCheckpoints({}, signal(), device)).toThrow(
      "Unsupported",
    );
  });
});

describe("installation provenance", () => {
  it("does not mistake unknown paths, empty state or malformed nvm protocols for proof", async () => {
    const { device, entries } = fixture();
    const nvm = entries.get("nvm")!;
    const node = entries.get("node")!;
    expect(
      await managed(
        device,
        nvm,
        { executable: node.executable, args: node.args, version: node.version },
        signal(),
      ),
    ).toBe(false);
    vi.mocked(device.host.run).mockResolvedValueOnce({ code: 1, stdout: "" });
    await expect(managed(device, nvm, node, signal())).rejects.toThrow(
      "managed installations",
    );
    vi.mocked(device.host.run)
      .mockResolvedValueOnce({ code: 0, stdout: `Current Root: ${root}` })
      .mockResolvedValueOnce({ code: 0, stdout: "" });
    await expect(managed(device, nvm, node, signal())).rejects.toThrow("Empty");
    vi.mocked(device.host.run)
      .mockResolvedValueOnce({ code: 0, stdout: `Current Root: ${root}` })
      .mockResolvedValueOnce({ code: 0, stdout: "unknown format" });
    await expect(managed(device, nvm, node, signal())).rejects.toThrow(
      "Unknown",
    );
    vi.mocked(device.host.run)
      .mockResolvedValueOnce({ code: 0, stdout: `Current Root: ${root}` })
      .mockResolvedValueOnce({
        code: 0,
        stdout: "No installations recognized.",
      });
    expect(await managed(device, nvm, node, signal())).toBe(false);
  });

  it("checks Unix nvm installations via canonical which results", async () => {
    const { device, entries } = fixture();
    Object.defineProperty(device.host, "platform", { value: "linux" });
    const base = join(root, "versions", "node", "v22.15.0");
    const node: ToolFact = {
      ...entries.get("node")!,
      realPath: join(base, "bin", "node"),
    };
    vi.mocked(device.host.run).mockResolvedValue({
      code: 0,
      stdout: node.realPath!,
    });
    expect(await managed(device, entries.get("nvm")!, node, signal())).toBe(
      true,
    );
    expect(
      await managed(
        device,
        entries.get("nvm")!,
        { ...node, realPath: resolve("other") },
        signal(),
      ),
    ).toBe(false);
    await expect(
      managed(
        device,
        entries.get("nvm")!,
        {
          ...node,
          realPath: join(root, "versions", "node", "not-a-version", "node"),
        },
        signal(),
      ),
    ).rejects.toThrow("layout");
    vi.mocked(device.host.run).mockResolvedValue({
      code: 0,
      stdout: resolve("other"),
    });
    await expect(
      managed(device, entries.get("nvm")!, node, signal()),
    ).rejects.toThrow("provenance");
    delete device.host.env.NVM_DIR;
    await expect(
      managed(device, entries.get("nvm")!, node, signal()),
    ).rejects.toThrow("NVM_DIR");
  });

  it("checks both standard npm layouts and propagates unexpected canonicalization faults", async () => {
    const { device, entries } = fixture();
    const node = entries.get("node")!;
    const cli = join(
      dirname(node.realPath!),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    expect(await paired(device, node, { node: node.realPath!, cli })).toBe(
      true,
    );
    expect(
      await paired(
        device,
        { executable: node.executable, args: node.args, version: node.version },
        { node: "", cli },
      ),
    ).toBe(false);
    vi.mocked(device.host.canonical).mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    expect(await paired(device, node, { node: node.realPath!, cli })).toBe(
      true,
    );
    vi.mocked(device.host.canonical).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    await expect(
      paired(device, node, { node: node.realPath!, cli }),
    ).rejects.toThrow("denied");
    expect(
      await paired(device, node, {
        node: node.realPath!,
        cli: resolve("other"),
      }),
    ).toBe(false);
  });
});
