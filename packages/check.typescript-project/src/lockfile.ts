import { valid } from "semver";
import { record, Unconfirmed } from "./files.js";

interface Reference {
  version: string;
  peers: Map<string, string>;
}
function reference(value: string): Reference {
  if (value.length > 8192)
    throw new Unconfirmed("lockfile 引用超过 8192 字符预算");
  const first = value.indexOf("(");
  const version = first < 0 ? value : value.slice(0, first);
  if (valid(version) !== version)
    throw new Unconfirmed(`不支持的 registry lockfile 引用: ${version}`);
  const peers = new Map<string, string>();
  let offset = first < 0 ? value.length : first;
  while (offset < value.length) {
    if (value[offset] !== "(" || peers.size >= 64)
      throw new Unconfirmed("lockfile peer 后缀损坏或超过 64 个绑定预算");
    const start = ++offset;
    let depth = 1;
    while (offset < value.length && depth) {
      if (value[offset] === "(") depth++;
      if (value[offset] === ")") depth--;
      if (depth > 32) throw new Unconfirmed("lockfile peer 后缀超过 32 层预算");
      offset++;
    }
    if (depth) throw new Unconfirmed("lockfile peer 后缀括号不完整");
    const match = /^((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(.+)$/.exec(
      value.slice(start, offset - 1),
    );
    if (!match || peers.has(match[1]!))
      throw new Unconfirmed("lockfile peer 后缀身份缺失或重复");
    const peerVersion = match[2]!.split("(")[0]!;
    if (valid(peerVersion) !== peerVersion)
      throw new Unconfirmed("lockfile peer 后缀不是准确 registry 版本");
    peers.set(match[1]!, match[2]!);
  }
  return { version, peers };
}
function packageEntry(
  packages: Record<string, unknown>,
  name: string,
  version: string,
) {
  const entry = record(packages[`${name}@${version}`]);
  const resolution = record(entry.resolution);
  if (typeof resolution.integrity !== "string" || !resolution.integrity)
    throw new Unconfirmed(
      `${name}@${version}: lockfile packages 缺少 registry integrity`,
    );
}

/** Follow only the selected importer's exact snapshot edges, never a global version search. */
export function resolvedPeer(
  lock: Record<string, unknown>,
  importer: string,
  name: string,
  installedReference: string,
  peer: string,
): { version: string; reference: string } | undefined {
  if (lock.lockfileVersion !== "9.0" && lock.lockfileVersion !== 9)
    throw new Unconfirmed("peer 解析首版仅支持 pnpm lockfile v9");
  const owner = record(record(lock.importers)[importer]);
  const selected = record(record(owner.devDependencies)[name]);
  if (selected.version !== installedReference)
    throw new Unconfirmed(
      `${importer}: ${name} importer 引用与实际检查上下文不一致`,
    );
  const parent = reference(installedReference);
  const packages = record(lock.packages);
  const snapshots = record(lock.snapshots);
  packageEntry(packages, name, parent.version);
  const snapshot = record(snapshots[`${name}@${installedReference}`]);
  const dependencies = record(snapshot.dependencies ?? {});
  const optional = record(snapshot.optionalDependencies ?? {});
  const direct = dependencies[peer];
  const conditional = optional[peer];
  if (
    direct !== undefined &&
    conditional !== undefined &&
    direct !== conditional
  )
    throw new Unconfirmed(`${name}: peer ${peer} 的 snapshot edges 冲突`);
  const suffix = parent.peers.get(peer);
  const edge = direct ?? conditional ?? suffix;
  if (edge === undefined) return undefined;
  if (typeof edge !== "string")
    throw new Unconfirmed(`${name}: peer ${peer} snapshot 引用不是字符串`);
  const parsed = reference(edge);
  if (
    suffix !== undefined &&
    (reference(suffix).version !== parsed.version ||
      (suffix.includes("(") && suffix !== edge))
  )
    throw new Unconfirmed(
      `${name}: peer ${peer} snapshot 与 importer 后缀冲突`,
    );
  packageEntry(packages, peer, parsed.version);
  record(snapshots[`${peer}@${edge}`]);
  return { version: parsed.version, reference: edge };
}
