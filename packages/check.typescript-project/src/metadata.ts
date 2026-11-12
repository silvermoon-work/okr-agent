import { compare, maxSatisfying, parse, valid, validRange } from "semver";
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
const API_AGE = 300_000;
const PAGE_SIZE = 100;
const MAX_VERSIONS = 4000;
export function fresh<T>(evidence: Observation<T>, now = Date.now()): T {
  if (!evidence.authoritative)
    throw new Unconfirmed(`${evidence.source}: 缺少可信完整发行证据`);
  if (
    !Number.isFinite(evidence.observedAt) ||
    evidence.observedAt > now + 60_000 ||
    now - evidence.observedAt > MAX_AGE ||
    !evidence.source.startsWith("https://")
  )
    throw new Unconfirmed("发行证据过期、来源无效或观察时间不可信");
  return evidence.data;
}
interface Timeline {
  version: string;
  time: string;
}
interface Manifest {
  release: Release;
  revision: string;
  modified: string;
  visible: string[];
}

/** Audited public canonical-backed API; no device registry or business URL override. */
export function publicMetadata(signal: AbortSignal): Metadata {
  const origin = "https://npmx.dev/api/registry/";
  const cache = new Map<string, Promise<Observation<PackageFacts>>>();
  const runDeadline = AbortSignal.timeout(90_000);
  let nodeCache: Promise<Observation<NodeFacts>> | undefined;
  let requests = 0;
  let bytes = 0;
  const json = async (
    url: string,
    maximumAge: number,
    deadline?: AbortSignal,
  ): Promise<Observation<unknown>> => {
    signal.throwIfAborted();
    if (++requests > 512)
      throw new Unconfirmed("元数据请求超过 512 次执行预算");
    const timeout = AbortSignal.timeout(10_000);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([
          signal,
          runDeadline,
          timeout,
          ...(deadline ? [deadline] : []),
        ]),
        redirect: "error",
        headers: { accept: "application/json", "cache-control": "no-cache" },
      });
      if (!response.ok)
        throw new Unconfirmed(`${url}: HTTP ${response.status}`);
      const date = Date.parse(response.headers.get("date") ?? "");
      const age = Number(response.headers.get("age") ?? "0") * 1000;
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
        !Number.isFinite(age) ||
        age < 0 ||
        age > maximumAge ||
        Math.abs(Date.now() - date) > maximumAge ||
        /stale|expired|revalidating|\b11[01]\b/i.test(state)
      )
        throw new Unconfirmed(
          `${url}: 缓存陈旧或无法确认 HTTP 响应新鲜度 (${state.trim() || "no cache status"})`,
        );
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
          if (size > 4_194_304 || bytes > 16_777_216)
            throw new Unconfirmed(
              `${url}: 元数据超过 4MiB/响应或 16MiB/执行预算`,
            );
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      return {
        data: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        source: `${url} [date=${new Date(date).toISOString()},age=${age / 1000}s,cache=${state.trim() || "unspecified"}]`,
        observedAt: Math.min(Date.now(), date - age),
        authoritative: true,
      };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Unconfirmed) throw error;
      if (
        runDeadline.aborted ||
        deadline?.aborted ||
        timeout.aborted ||
        error instanceof TypeError ||
        error instanceof SyntaxError
      )
        throw new Unconfirmed(
          `${url}: ${
            runDeadline.aborted
              ? "90s 执行元数据预算"
              : deadline?.aborted
                ? "45s 单包预算"
                : timeout.aborted
                  ? "10s 请求超时"
                  : String(error)
          }`,
        );
      throw error;
    }
  };
  return {
    package(name, selection) {
      if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name))
        throw new Unconfirmed("仅查询公开 npm 包名，不发送私有路径或 URL");
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
      const key = JSON.stringify([name, selection.current, selection.series]);
      const prior = cache.get(key);
      if (prior) return prior;
      if (cache.size >= 64)
        throw new Unconfirmed("元数据超过 64 个包/解析选择的执行预算");
      let lastSource = `${origin}timeline/${encodeURIComponent(name)}`;
      const request = (async () => {
        const deadline = AbortSignal.timeout(45_000);
        const observations: Observation<unknown>[] = [];
        const read = async (url: string) => {
          lastSource = url;
          const observation = await json(url, API_AGE, deadline);
          lastSource = observation.source;
          observations.push(observation);
          return record(observation.data);
        };
        const encoded = encodeURIComponent(name);
        const timelineUrl = `${origin}timeline/${encoded}`;
        const sweep = async (): Promise<Timeline[]> => {
          const versions: Timeline[] = [];
          let total: number | undefined;
          for (let offset = 0; offset < MAX_VERSIONS; offset += PAGE_SIZE) {
            const page = await read(
              `${timelineUrl}?offset=${offset}&limit=${PAGE_SIZE}&sort=semver&stable-only=true`,
            );
            if (
              !Number.isSafeInteger(page.total) ||
              typeof page.total !== "number" ||
              page.total < 1 ||
              page.total > MAX_VERSIONS ||
              page.offset !== offset ||
              (total !== undefined && page.total !== total) ||
              !Array.isArray(page.versions) ||
              page.versions.length !== Math.min(PAGE_SIZE, page.total - offset)
            )
              throw new Unconfirmed(
                `${timelineUrl}: 分页 total/offset/长度不完整、不一致或超过 4000 稳定版本预算`,
              );
            total = page.total;
            for (const raw of page.versions as unknown[]) {
              const entry = record(raw);
              if (
                typeof entry.version !== "string" ||
                valid(entry.version) !== entry.version ||
                parse(entry.version)!.prerelease.length ||
                typeof entry.time !== "string" ||
                !Number.isFinite(Date.parse(entry.time)) ||
                Date.parse(entry.time) > Date.now() + 60_000
              )
                throw new Unconfirmed(
                  `${timelineUrl}: 稳定版本/发行时间缺失或无效`,
                );
              const previous = versions.at(-1);
              if (previous && compare(previous.version, entry.version) <= 0)
                throw new Unconfirmed(
                  `${timelineUrl}: 版本跨页重复或非严格 SemVer 降序`,
                );
              versions.push({ version: entry.version, time: entry.time });
            }
            if (versions.length === total) return versions;
          }
          throw new Unconfirmed(`${timelineUrl}: 分页预算耗尽`);
        };
        const first = await sweep();
        const newest = maxSatisfying(
          first.map((entry) => entry.version),
          selection.series,
        );
        if (
          !newest ||
          !first.some((entry) => entry.version === selection.current)
        )
          throw new Unconfirmed(
            `${timelineUrl}: 缺少所选系列候选或真实 importer 版本`,
          );
        const manifest = async (version: string): Promise<Manifest> => {
          const raw = await read(
            `${origin}packument/${encoded}?version=${encodeURIComponent(version)}`,
          );
          const full = record(raw.requestedVersion);
          const time = record(raw.time ?? {});
          const dist = record(full.dist ?? {});
          if (
            raw.name !== name ||
            full.name !== name ||
            full.version !== version ||
            typeof raw._rev !== "string" ||
            !/^[A-Za-z0-9._:-]{1,256}$/.test(raw._rev) ||
            typeof time.modified !== "string" ||
            !Number.isFinite(Date.parse(time.modified)) ||
            Date.parse(time.modified) > Date.now() + 60_000 ||
            time[version] !==
              first.find((entry) => entry.version === version)?.time ||
            typeof dist.tarball !== "string" ||
            !dist.tarball.startsWith("https://") ||
            !(
              (typeof dist.integrity === "string" &&
                dist.integrity.length > 0) ||
              (typeof dist.shasum === "string" && dist.shasum.length > 0)
            )
          )
            throw new Unconfirmed(
              `${origin}packument/${encoded}: requestedVersion 不是完整准确的 manifest/发行时间/修订证据`,
            );
          const engines =
            full.engines === undefined ? undefined : record(full.engines);
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
              Object.values(peers).some(
                (range) => typeof range !== "string",
              )) ||
            (peerMeta &&
              Object.values(peerMeta).some((value) => {
                const meta = record(value);
                return (
                  meta.optional !== undefined &&
                  typeof meta.optional !== "boolean"
                );
              }))
          )
            throw new Unconfirmed(
              `${origin}packument/${encoded}: engines/peer 元数据缺失或无效`,
            );
          const release: Release = { version };
          if (typeof engines?.node === "string")
            release.engines = { node: engines.node };
          if (peers) release.peerDependencies = peers as Record<string, string>;
          if (peerMeta)
            release.peerDependenciesMeta = peerMeta as NonNullable<
              Release["peerDependenciesMeta"]
            >;
          return {
            release,
            revision: raw._rev,
            modified: time.modified,
            visible: Object.keys(record(raw.versions)),
          };
        };
        const current = await manifest(selection.current);
        const latest =
          newest === selection.current ? current : await manifest(newest);
        if (
          current.revision !== latest.revision ||
          current.modified !== latest.modified
        )
          throw new Unconfirmed(
            `${origin}packument/${encoded}: current/newest 修订冲突`,
          );
        // Slim versions are only a conflict witness, never the complete candidate set.
        const conflicting = [...current.visible, ...latest.visible].find(
          (version) =>
            valid(version) &&
            maxSatisfying([version, newest], selection.series) !== newest,
        );
        if (conflicting)
          throw new Unconfirmed(
            `${timelineUrl}: timeline 与 manifest 可见版本冲突 ${conflicting}`,
          );
        const second = await sweep();
        if (JSON.stringify(first) !== JSON.stringify(second))
          throw new Unconfirmed(`${timelineUrl}: 两次完整分页扫描不一致`);
        return {
          authoritative: true,
          observedAt: Math.min(
            ...observations.map((observation) => observation.observedAt),
          ),
          source:
            `${observations[0]!.source}; completeStable=${first.length},twoSweeps=true,pages=${Math.ceil(first.length / PAGE_SIZE)}; ` +
            `${[...new Set([selection.current, newest])].map((version) => `${origin}packument/${encoded}?version=${version}`).join(" + ")}; rev=${current.revision}; auditedServerCache=300s+300s,SWR-reported-stale-rejected`,
          data: {
            versions: first.map((entry) => entry.version),
            releases: {
              [selection.current]: current.release,
              [newest]: latest.release,
            },
          },
        };
      })().catch((error: unknown) => {
        signal.throwIfAborted();
        if (error instanceof Unconfirmed)
          throw new Unconfirmed(`${lastSource}: ${error.message}`);
        throw error;
      });
      cache.set(key, request);
      return request;
    },
    node() {
      nodeCache ??= (async () => {
        const [releases, schedule] = await Promise.all([
          json("https://nodejs.org/dist/index.json", MAX_AGE),
          json(
            "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json",
            MAX_AGE,
          ),
        ]);
        if (!Array.isArray(releases.data))
          throw new Unconfirmed("Node 官方发行列表格式无法确认");
        for (const raw of releases.data as unknown[]) {
          const release = record(raw);
          if (
            typeof release.version !== "string" ||
            !valid(release.version.replace(/^v/, "")) ||
            (typeof release.lts !== "string" && release.lts !== false)
          )
            throw new Unconfirmed("Node 官方发行记录缺项/格式无法确认");
        }
        return {
          source: `${releases.source} + ${schedule.source}`,
          observedAt: Math.min(releases.observedAt, schedule.observedAt),
          authoritative: true,
          data: {
            releases: releases.data as NodeFacts["releases"],
            schedule: record(schedule.data) as NodeFacts["schedule"],
          },
        };
      })();
      return nodeCache;
    },
  };
}
