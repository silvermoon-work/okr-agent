import { createHash } from "node:crypto";
import { maxSatisfying, parse, valid, validRange } from "semver";
import { record, Unconfirmed } from "./files.js";

export interface Observation<T> {
  data: T;
  source: string;
  observedAt: number;
  authoritative: boolean;
}
export interface Release {
  version: string;
  engines?: { node?: string };
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
export interface PackageSelection {
  current: string;
  series: string;
}
export interface PackageFacts {
  versions: string[];
  releases: Record<string, Release>;
}
export interface NodeFacts {
  releases: { version: string; lts: string | false }[];
  schedule: Record<string, { lts?: string; end: string }>;
  historicalIndex?: { source: string; cacheAgeMs: number };
}
export interface Metadata {
  package(
    this: void,
    name: string,
    selection: PackageSelection,
  ): Promise<Observation<PackageFacts>>;
  node(this: void): Promise<Observation<NodeFacts>>;
}
export const MAX_AGE = 3_600_000;
export const METADATA_PROFILE = "canonical-v1";
const registry = "https://registry.npmjs.org/";
const scheduleUrl =
  "https://api.github.com/repos/nodejs/Release/contents/schedule.json?ref=main";
const publicTools = new Set([
  "pnpm",
  "typescript",
  "eslint",
  "typescript-eslint",
  "@eslint/js",
  "@typescript-eslint/parser",
  "@typescript-eslint/eslint-plugin",
  "prettier",
  "vitest",
  "vite",
  "@vitest/coverage-v8",
  "@vitest/coverage-istanbul",
  "publint",
  "turbo",
  "globals",
  "@types/node",
  "@types/semver",
  "github-ci-verify",
  "semver",
]);
export function fresh<T>(evidence: Observation<T>, now = Date.now()): T {
  if (!evidence.authoritative)
    throw new Unconfirmed(`${evidence.source}: 缺少可信完整发行证据`);
  if (
    !Number.isFinite(evidence.observedAt) ||
    evidence.observedAt > now + 60_000 ||
    now - evidence.observedAt > MAX_AGE ||
    !evidence.source.startsWith("https://")
  )
    throw new Unconfirmed(
      `${evidence.source}: 发行证据过期、来源无效或观察时间不可信，observedAt=${evidence.observedAt}`,
    );
  return evidence.data;
}
interface HttpObservation extends Observation<unknown> {
  cacheAgeMs: number;
}
interface Packument {
  versions: Record<string, unknown>;
  stable: string[];
}
function release(name: string, version: string, value: unknown): Release {
  const full = record(value);
  const dist = record(full.dist ?? {});
  if (
    full.name !== name ||
    full.version !== version ||
    typeof dist.tarball !== "string" ||
    !dist.tarball.startsWith("https://") ||
    !(
      (typeof dist.integrity === "string" && dist.integrity.length > 0) ||
      (typeof dist.shasum === "string" && dist.shasum.length > 0)
    )
  )
    throw new Unconfirmed(
      `${name}@${version}: 准确完整 manifest 身份/发行记录缺失`,
    );
  const engines = full.engines === undefined ? undefined : record(full.engines);
  const peers =
    full.peerDependencies === undefined
      ? undefined
      : record(full.peerDependencies);
  const peerMeta =
    full.peerDependenciesMeta === undefined
      ? undefined
      : record(full.peerDependenciesMeta);
  if (
    (engines?.node !== undefined && typeof engines.node !== "string") ||
    (peers &&
      Object.values(peers).some((range) => typeof range !== "string")) ||
    (peerMeta &&
      Object.values(peerMeta).some((value) => {
        const meta = record(value);
        return (
          meta.optional !== undefined && typeof meta.optional !== "boolean"
        );
      }))
  )
    throw new Unconfirmed(`${name}@${version}: engines/peer 元数据无效`);
  const result: Release = { version };
  if (typeof engines?.node === "string")
    result.engines = { node: engines.node };
  if (peers) result.peerDependencies = peers as Record<string, string>;
  if (peerMeta)
    result.peerDependenciesMeta = peerMeta as NonNullable<
      Release["peerDependenciesMeta"]
    >;
  return result;
}

/** Closed author policy. The execution host must authorize all canonical-v1 sources. */
export function publicMetadata(signal: AbortSignal): Metadata {
  const cache = new Map<string, Promise<Observation<Packument>>>();
  const runDeadline = AbortSignal.timeout(90_000);
  let nodeCache: Promise<Observation<NodeFacts>> | undefined;
  let requests = 0;
  let bytes = 0;
  const json = async (
    url: string,
    accept: string,
  ): Promise<HttpObservation> => {
    signal.throwIfAborted();
    if (++requests > 66) throw new Unconfirmed("元数据超过 66 次请求预算");
    const timeout = AbortSignal.timeout(10_000);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, runDeadline, timeout]),
        redirect: "error",
        headers: { accept, "cache-control": "no-cache" },
      });
      if (!response.ok)
        throw new Unconfirmed(`${url}: HTTP ${response.status}`);
      const now = Date.now();
      const date = Date.parse(response.headers.get("date") ?? "");
      const rawAge = response.headers.get("age");
      const age = Number(rawAge ?? "0") * 1000;
      const cacheAgeMs = Math.max(0, now - date, age);
      const state = [
        "x-nitro-cache",
        "x-vercel-cache",
        "x-cache",
        "cache-status",
        "warning",
      ]
        .map((key) => response.headers.get(key) ?? "")
        .join(" ");
      if (
        !Number.isFinite(date) ||
        date > now + 60_000 ||
        (rawAge !== null && !/^\d+$/.test(rawAge)) ||
        !Number.isSafeInteger(age) ||
        cacheAgeMs > MAX_AGE ||
        /stale|expired|revalidating|\b11[01]\b/i.test(state)
      )
        throw new Unconfirmed(
          `${url}: 缓存陈旧或无法确认 HTTP 响应新鲜度；Date=${response.headers.get("date")}, Age=${rawAge ?? "0"}s, cacheAgeMs=${cacheAgeMs}；要求至多 ${MAX_AGE}ms 且无 stale/expired/revalidating (${state.trim() || "no cache status"})`,
        );
      if (
        url.startsWith(registry) &&
        !/^application\/(?:vnd\.npm\.install-v1\+json|json)(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw new Unconfirmed(`${url}: registry JSON 媒体类型无法确认`);
      if (!response.body) throw new Unconfirmed(`${url}: 空响应`);
      const reader =
        response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          bytes += part.value.byteLength;
          if (size > 16_777_216 || bytes > 134_217_728)
            throw new Unconfirmed(`${url}: 超过 16MiB/响应或 128MiB/执行预算`);
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      return {
        data: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        source: `${url} [profile=${METADATA_PROFILE},date=${new Date(date).toISOString()},age=${age / 1000}s,cache=${state.trim() || "unspecified"}]`,
        observedAt: now - cacheAgeMs,
        authoritative: true,
        cacheAgeMs,
      };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Unconfirmed) throw error;
      if (
        runDeadline.aborted ||
        timeout.aborted ||
        error instanceof TypeError ||
        error instanceof SyntaxError
      )
        throw new Unconfirmed(
          `${url}: ${
            runDeadline.aborted
              ? "90s 执行元数据预算"
              : timeout.aborted
                ? "10s 请求超时"
                : String(error)
          }`,
        );
      throw error;
    }
  };
  const packument = (name: string) => {
    const prior = cache.get(name);
    if (prior) return prior;
    if (cache.size >= 64) throw new Unconfirmed("元数据超过 64 个公开包预算");
    const url = `${registry}${encodeURIComponent(name)}`;
    const request = (async (): Promise<Observation<Packument>> => {
      const observed = await json(url, "application/vnd.npm.install-v1+json");
      const raw = record(observed.data);
      const versions = record(raw.versions);
      const tags = record(raw["dist-tags"]);
      if (
        raw.name !== name ||
        typeof raw.modified !== "string" ||
        !Number.isFinite(Date.parse(raw.modified)) ||
        Date.parse(raw.modified) > observed.observedAt + 60_000 ||
        Object.keys(versions).length < 1 ||
        Object.keys(versions).length > 32_768 ||
        Object.keys(tags).length < 1 ||
        Object.values(tags).some(
          (version) =>
            typeof version !== "string" || !Object.hasOwn(versions, version),
        )
      )
        throw new Unconfirmed(
          `${url}: 完整 packument 身份/版本/标签不完整或冲突`,
        );
      const stable: string[] = [];
      for (const [version, value] of Object.entries(versions)) {
        const parsed = parse(version);
        if (
          !parsed ||
          valid(version) !== version ||
          record(value).version !== version
        )
          throw new Unconfirmed(`${url}: 完整版本列表包含无效或冲突记录`);
        if (!parsed.prerelease.length) stable.push(version);
      }
      if (!stable.length) throw new Unconfirmed(`${url}: 没有稳定发行候选`);
      return {
        ...observed,
        source: `${observed.source}; completeInstallPackument=true,versions=${Object.keys(versions).length},stable=${stable.length},modified=${raw.modified}`,
        data: { versions, stable },
      };
    })();
    cache.set(name, request);
    return request;
  };
  return {
    async package(name, selection) {
      signal.throwIfAborted();
      if (!publicTools.has(name))
        throw new Unconfirmed(
          "来源政策仅查询已支持的公开开发工具，不发送私有名称/路径/URL",
        );
      if (
        valid(selection.current) !== selection.current ||
        parse(selection.current)!.prerelease.length ||
        !/^(?:[1-9]\d*\.x|0\.[1-9]\d*\.x|0\.0\.(?:0|[1-9]\d*))$/.test(
          selection.series,
        ) ||
        !validRange(selection.series)
      )
        throw new Unconfirmed(
          "内部元数据选择必须是稳定精确 current 与固定 SemVer 系列",
        );
      const observed = await packument(name);
      const facts = fresh(observed);
      const newest = maxSatisfying(facts.stable, selection.series);
      if (!newest || !facts.stable.includes(selection.current))
        throw new Unconfirmed(
          `${observed.source}: 缺少所选系列候选或真实 importer 版本`,
        );
      return {
        ...observed,
        source: `${observed.source}; current=${selection.current},series=${selection.series},newest=${newest}`,
        data: {
          versions: facts.stable,
          releases: {
            [selection.current]: release(
              name,
              selection.current,
              facts.versions[selection.current],
            ),
            [newest]: release(name, newest, facts.versions[newest]),
          },
        },
      };
    },
    node() {
      nodeCache ??= (async () => {
        const [index, schedule] = await Promise.all([
          json("https://nodejs.org/dist/index.json", "application/json"),
          json(scheduleUrl, "application/vnd.github+json"),
        ]);
        if (!Array.isArray(index.data) || index.data.length > 20_000)
          throw new Unconfirmed("Node 官方历史发行列表格式/预算无法确认");
        const releases = (index.data as unknown[]).map(
          (raw): NodeFacts["releases"][number] => {
            const entry = record(raw);
            const parsed =
              typeof entry.version === "string" && entry.version.startsWith("v")
                ? parse(entry.version.slice(1))
                : null;
            if (
              typeof entry.version !== "string" ||
              !parsed ||
              valid(entry.version.slice(1)) !== entry.version.slice(1) ||
              (typeof entry.lts !== "string" && entry.lts !== false) ||
              (typeof entry.lts === "string" && !entry.lts.trim()) ||
              (parsed.prerelease.length > 0 && entry.lts !== false)
            )
              throw new Unconfirmed("Node 官方历史发行记录缺项/格式无法确认");
            return { version: entry.version, lts: entry.lts };
          },
        );
        if (
          new Set(releases.map((release) => release.version)).size !==
          releases.length
        )
          throw new Unconfirmed(
            `${index.source}: Node 官方发行版本重复或冲突，不能选择最新 LTS`,
          );
        const file = record(schedule.data);
        if (
          file.path !== "schedule.json" ||
          file.type !== "file" ||
          file.encoding !== "base64" ||
          typeof file.content !== "string" ||
          typeof file.sha !== "string" ||
          !/^[a-f0-9]{40}$/.test(file.sha) ||
          !Number.isSafeInteger(file.size) ||
          typeof file.size !== "number" ||
          file.size < 1 ||
          file.size > 262_144
        )
          throw new Unconfirmed(
            "Node 官方生命周期 contents 身份/编码/大小缺失",
          );
        const encoded = file.content.replace(/\n/g, "");
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded,
          )
        )
          throw new Unconfirmed("Node 官方生命周期 base64 无效");
        const decoded = Buffer.from(encoded, "base64");
        if (
          decoded.length !== file.size ||
          createHash("sha1")
            .update(`blob ${decoded.length}\0`)
            .update(decoded)
            .digest("hex") !== file.sha
        )
          throw new Unconfirmed("Node 官方生命周期内容与大小/Git SHA 冲突");
        let lifecycle: Record<string, unknown>;
        try {
          lifecycle = record(JSON.parse(decoded.toString("utf8")) as unknown);
        } catch (error) {
          if (error instanceof SyntaxError)
            throw new Unconfirmed("Node 官方生命周期 JSON 无效");
          throw error;
        }
        if (
          !Object.keys(lifecycle).length ||
          Object.keys(lifecycle).length > 256
        )
          throw new Unconfirmed("Node 官方生命周期列表缺失或超过预算");
        for (const [series, raw] of Object.entries(lifecycle)) {
          const entry = record(raw);
          if (
            !/^v\d+(?:\.\d+)?$/.test(series) ||
            typeof entry.end !== "string" ||
            !Number.isFinite(Date.parse(entry.end)) ||
            (entry.lts !== undefined &&
              (typeof entry.lts !== "string" ||
                !Number.isFinite(Date.parse(entry.lts)) ||
                Date.parse(entry.lts) >= Date.parse(entry.end)))
          )
            throw new Unconfirmed("Node 官方生命周期日期/系列无效");
        }
        return {
          source: `${schedule.source}; lifecycleSha=${file.sha}; releaseIndex=${index.source}`,
          observedAt: Math.min(index.observedAt, schedule.observedAt),
          authoritative: true,
          data: {
            releases,
            schedule: lifecycle as NodeFacts["schedule"],
            historicalIndex: {
              source: index.source,
              cacheAgeMs: index.cacheAgeMs,
            },
          },
        };
      })();
      return nodeCache;
    },
  };
}
