import {
  defineCheckpoint,
  failed,
  type CheckpointContext,
  type CheckpointResult,
  type RuleFailure,
} from "@silvermoon-work/check-task-sdk";
import { Input, type RuleCode, type Tool } from "./contract.js";
import { type Device, type ToolFact } from "./device.js";
import { compareVersions } from "./legacy/tools.js";
import { managed, paired } from "./provenance.js";
import { packageRequirements, resolvePolicy } from "./policy.js";

const installationCodes = {
  nvm: ["nvm-installation-executable", "nvm-installation-version-valid"],
  node: ["node-installation-executable", "node-installation-version-valid"],
  npm: ["npm-installation-executable", "npm-installation-version-valid"],
  pnpm: ["pnpm-installation-executable", "pnpm-installation-version-valid"],
  nrm: ["nrm-installation-executable", "nrm-installation-version-valid"],
} as const;
const failure = <Code extends RuleCode>(
  code: Code,
  brief: string,
): RuleFailure<Code> => ({
  code,
  brief,
});

export function toolchainCheckpoints(
  input: Input,
  signal: AbortSignal,
  device: Device,
) {
  const policy = resolvePolicy(input);
  const { host, directory } = device;
  if (!["win32", "linux", "darwin"].includes(host.platform))
    throw new Error("Unsupported device platform.");
  const installation = (
    name: Tool,
    extraRules: readonly { code: RuleCode; description: string }[] = [],
    extra?: (
      entry: ToolFact,
      context: CheckpointContext,
    ) => Promise<RuleFailure<RuleCode>[]>,
  ) =>
    defineCheckpoint({
      id: `${name}-installation`,
      target: Input,
      description: `核验 ${name} 的设备入口、版本及适用的安装归属。`,
      rules: [
        {
          code: installationCodes[name][0],
          description: `${name} 必须存在且固定版本命令可执行。`,
        },
        {
          code: installationCodes[name][1],
          description: `${name} 的版本必须可识别且满足可选下限。`,
        },
        ...extraRules,
      ],
      output: {
        description:
          "成功输出本次确认的工具入口与 version，供本次后续步骤的显式 outputOf 接线使用，不发布该值。",
      },
      check: async (
        _target,
        context,
      ): Promise<CheckpointResult<ToolFact, RuleCode>> => {
        signal.throwIfAborted();
        const entry = await host.locate(name, directory);
        const invalid = (
          code: RuleCode,
          brief: string,
        ): CheckpointResult<ToolFact, RuleCode> => ({
          pass: false,
          problems: [failure(code, `${name}：${brief}`)],
        });
        if (!entry)
          return invalid(installationCodes[name][0], "未找到设备工具入口。");
        const output = await host.run(
          entry,
          [
            name === "nvm" && host.platform === "win32"
              ? "version"
              : "--version",
          ],
          directory,
          signal,
        );
        if (output.code !== 0)
          return invalid(
            installationCodes[name][0],
            `版本命令退出码 ${String(output.code)}。`,
          );
        const version = /^v?([0-9]+(?:\.[0-9]+)+)\s*$/.exec(
          output.stdout.trim(),
        )?.[1];
        if (!version)
          return invalid(
            installationCodes[name][1],
            "版本输出无法识别，未回显原始输出。",
          );
        const minimum = input.minimumVersions?.[name];
        if (minimum && compareVersions(version, minimum) < 0)
          return invalid(
            installationCodes[name][1],
            `当前 ${version}，要求不低于 ${minimum}。`,
          );
        const fact: ToolFact = { ...entry, version };
        const [first, ...rest] = (await extra?.(fact, context)) ?? [];
        return first
          ? { pass: false, problems: [first, ...rest] }
          : { pass: true, output: fact };
      },
    });

  const nvm = installation("nvm");
  const node = installation(
    "node",
    [
      {
        code: "node-installation-managed-by-nvm",
        description: "Node 必须属于 nvm 已确认管理的安装。",
      },
    ],
    async (entry, context) => {
      if (!entry.realPath)
        return [
          failure(
            "node-installation-managed-by-nvm",
            "node：入口证据不足，无法确认 nvm 管理归属。",
          ),
        ];
      return (await managed(device, context.outputOf(nvm), entry, signal))
        ? []
        : [
            failure(
              "node-installation-managed-by-nvm",
              "node：实际入口不属于 nvm 已确认管理的安装。",
            ),
          ];
    },
  );
  const npm = installation(
    "npm",
    [
      {
        code: "npm-installation-managed-by-nvm",
        description: "npm 必须独立确认属于 nvm 管理的安装。",
      },
      {
        code: "npm-installation-paired-with-node",
        description: "npm CLI 及运行时必须与前序 Node 安装配对。",
      },
    ],
    async (entry, context) => {
      const location = await host.npmLocation(entry, directory, signal);
      if (!location)
        return [
          failure(
            "npm-installation-managed-by-nvm",
            "npm：入口证据不足，无法确认 nvm 管理归属。",
          ),
        ];
      if (
        !(await managed(device, context.outputOf(nvm), entry, signal, location))
      )
        return [
          failure(
            "npm-installation-managed-by-nvm",
            "npm：CLI 或运行时不属于 nvm 管理的安装。",
          ),
        ];
      const currentNode = context.outputOf(node);
      return (await paired(device, currentNode, location))
        ? []
        : [
            failure(
              "npm-installation-paired-with-node",
              location.node !== currentNode.realPath
                ? "npm：实际运行时与当前 Node 安装不匹配。"
                : "npm：入口证据不足，无法确认 CLI 与当前 Node 安装配对。",
            ),
          ];
    },
  );
  const pnpm = installation("pnpm");
  const nrm = installation("nrm");
  const nvmConfiguration = defineCheckpoint({
    id: "nvm-configuration",
    target: Input,
    description: "确认新 Node 安装的默认全局包配置。",
    rules: [
      {
        code: "nvm-configuration-default-packages-configured",
        description:
          "原生自动重装配置必须包含固定基线及追加包，并保持基线版本约束。",
      },
    ],
    output: { description: "成功输出 undefined，不新增 Context 数据。" },
    check: async (_target, context) => {
      const values = await device.defaultPackages(context.outputOf(nvm));
      const code = "nvm-configuration-default-packages-configured";
      if (values === undefined)
        return failed([
          failure(
            code,
            "nvm：缺少默认全局包配置，或该版本不支持原生自动重装机制。",
          ),
        ]);
      const configured = packageRequirements(values);
      const problems: RuleFailure<typeof code>[] = [];
      for (const [name, version] of policy.requiredPackages)
        if (
          !configured.has(name) ||
          (version !== undefined && configured.get(name) !== version)
        )
          problems.push(
            failure(code, `nvm：默认全局包 ${name} 缺失或不满足固定版本要求。`),
          );
      return failed(problems);
    },
  });
  const nrmConfiguration = defineCheckpoint({
    id: "nrm-configuration",
    target: Input,
    description: "确认 nrm 必需注册项及期望默认选择。",
    rules: [
      {
        code: "nrm-configuration-registration-present",
        description: "基线及追加注册名称必须全部存在。",
      },
      {
        code: "nrm-configuration-registration-url-matched",
        description: "已存在注册项的 URL 必须规范化匹配。",
      },
      {
        code: "nrm-configuration-default-registry-selected",
        description: "nrm 当前选择必须匹配期望默认项的 URL。",
      },
    ],
    output: { description: "成功输出 undefined，不新增 Context 数据。" },
    check: async (_target, context) => {
      const state = await device.registryState(context.outputOf(nrm));
      const problems: RuleFailure<
        Extract<RuleCode, `nrm-configuration-${string}`>
      >[] = [];
      let selectedValid = true;
      for (const [name, url] of policy.requiredRegistries) {
        const actual = state.registrations.get(name);
        if (actual === undefined)
          problems.push(
            failure(
              "nrm-configuration-registration-present",
              `nrm：缺少注册名称 ${name}。`,
            ),
          );
        else if (actual !== url)
          problems.push(
            failure(
              "nrm-configuration-registration-url-matched",
              `nrm：注册名称 ${name} 的 URL 不符，实际值已隐藏。`,
            ),
          );
        if (name === policy.selectedName && actual !== url)
          selectedValid = false;
      }
      if (selectedValid && state.selectedUrl !== policy.selectedUrl)
        problems.push(
          failure(
            "nrm-configuration-default-registry-selected",
            `nrm：当前未选中期望的 ${policy.selectedName}，实际值已隐藏。`,
          ),
        );
      return failed(problems);
    },
  });
  return [
    nvm,
    node,
    npm,
    pnpm,
    nrm,
    nvmConfiguration,
    nrmConfiguration,
  ] as const;
}
