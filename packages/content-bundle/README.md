# Content Bundle

`@silvermoon-work/content-bundle@0.1.0-rc.0`
是只读内容包协议库的首个功能发布候选，
已登记为 npm 交付项。`0.0.0-rc.0` 仅为 Trusted Publisher 配置占位，不包含功能。
候选仅在准确 main 提交的必需 CI 成功后，通过 `publish-npm.yaml` 和 `npm`
environment
的 Trusted Publishing 发布至 `rc`；版本声明不代表已发布。
它不包含 CLI、Viewer、任务执行或存储配置。

## 协议

- 根必须是 UnixFS 目录 CID。上层先把 folder/zip/tar 导入内容存储，或提供已有
  CAR 的 block
  resolver；不要求上传公网。快照生成、文件监听、pin 和版本切换属于上层。
- 根目录的准确入口文件是 `.bundle.yaml`，UTF-8、单文档 YAML，大小写敏感。
  不搜索 `.bundle.yml` 或 `.bundle.json`。JSON 风格内容仍是合法 YAML。
- manifest 只包含下面的 `entry`，三个字段都必需，不支持未知字段。

```yaml
entry:
  path: data/events.jsonl
  schemaCid: "<Schema CID>"
  contentType: application/jsonl
```

ContentType 只支持 `application/json`、`application/yaml`、`application/jsonl`。
JSON/YAML 解析为一个 JSON-compatible 值；JSONL 按行解析为数组，保留顺序和重复值，
空文件为 `[]`，支持 CRLF 和末尾换行，内部空行和坏行报错。
JSONL Schema 必须显式声明根 `type: array`。不读取数据中的 `$schema` 来选择契约。
YAML 不接受多文档、重复字段、未知标签、非有限数或循环 aliases。
所有数据使用 JavaScript 数字表示，整数必须在安全整数范围内。

Schema 存为一个确定性 DAG-CBOR block，不经过 UnixFS 文件包装；
CID 使用 CIDv1、`dag-cbor` 和 SHA-256。对象字段顺序和源文本排版不影响 CID，
但字段值、描述和数组顺序仍影响 CID。

## Schema 和 content refs

Schema 方言固定为 JSON Schema 2020-12；省略 `$schema` 时仍使用该方言。
允许 `#/$defs/item` 和 `#anchor` 内部引用；外部 `$ref` 只允许
`ipfs://<CID>`，可带 JSON Pointer 或 anchor fragment。
外部 Schema 也必须是约定的 DAG-CBOR block。库核验 block 与 CID 一致；
下载、编码、导入由上层完成，不隐式获取 HTTP Schema。
`$defs` 中未用于入口的外部引用也必须可用且有效。
普通 `const`/`default` 等数据中的 `$ref` 不当作 Schema 依赖。
`contentSchema` 元数据中的 Schema 引用也检查完整性，但不隐式解码字符串内的内容。

当前 CID profile 不允许 `$id` 改变内部引用基准，也不支持 `$async`、
`$dynamicRef`、`$dynamicAnchor` 或旧 `$recursiveRef`。
`unevaluatedProperties` 和 `unevaluatedItems` 当前仅支持布尔 Schema，
其他形式明确报错，不静默跳过 content refs。
`format` 按 2020-12 annotation 处理，不启用 format assertion。

使用 `type: string` 和布尔扩展 `x-content-ref` 标注内容引用：

```json
{
  "type": "object",
  "properties": {
    "details": { "type": "string", "x-content-ref": true }
  }
}
```

```text
yaml:<Schema CID>:details/task.yaml
json:<Schema CID>:details/task.json
jsonl:<array Schema CID>:details/events.jsonl
bundle:child
```

引用路径始终相对于当前 bundle 根，不是当前数据文件；进入子 bundle 后以子目录为新根。
路径使用 `/`，不允许绝对路径、`.`/`..`、空路径段、反斜杠、URL/query/fragment
或编码路径。目标只能是普通文件或 UnixFS 子目录，不支持符号链接。

校验遍历实际适用的 Schema：所有 `allOf` 分支、匹配的 `anyOf`/`oneOf` 分支、
条件选中的 `then`/`else`、属性、数组和外部/内部引用。
`if`、`not` 的探测 Schema 不产生内容引用读取。
未标注的普通字符串即便具有相同前缀，也不会触发读取。
内容引用循环可去重处理，不是无限递归；节点、引用数和深度都有上限。

## Exports

```ts
import {
  openBundle,
  parseBundleManifest,
  parseContentRef,
  encodeSchema,
  ContentBundleError,
} from "@silvermoon-work/content-bundle";
```

- `openBundle(rootCid, options)`：核心异步入口，验证完整 UnixFS DAG、manifest、
  入口数据、可达 content refs/子 bundle 及 Schema 依赖。失败不返回 bundle。
  没有 Schema 的附件验证存储完整性和路径，不凭空赋予数据契约。
- `parseBundleManifest(bytes)`：同步解析并校验描述文件，不访问存储。
- `parseContentRef(value)`：同步解析引用语法、CID 和路径，不读取目标。
- `encodeSchema(schema)`：异步校验 Schema 结构/profile，返回 `{cid, bytes}`；
  不导入或上传。外部依赖的可用性和引用解析在 `openBundle` 时验证。
- `ContentBundleError`：稳定 `code`、`path`、JSON Pointer `pointer`、
  `referenceChain` 和底层 `cause`。缺失或损坏的 block、无效数据、资源超限和取消
  都明确失败。

类型导出：`ContentBundle`、`OpenBundleOptions`、`BundleLimits`、`BundleManifest`、
`ContentType`、`ContentRef`、`JsonSchema`、`SchemaBlock`、
`ContentBundleErrorCode`。CID 使用 `multiformats/cid` 的 `CID` 对象。

```ts
const bundle = await openBundle(rootCid, {
  resolveCid: (cid, { signal }) =>
    callerOwnedStore.block.get(cid.toString(), signal ? { signal } : {}),
  signal,
});

const stream = await bundle.readFile(bundle.manifest.entry.path);
```

`resolveCid` 为 UnixFS 和 Schema 提供原始 `Uint8Array`
block。它必须遵守取消信号；
库还使用底层 Store 的有界获取机制。调用者保留 resolver/Store 的所有权。

返回对象仅有 `cid`、`manifest`、`readFile(path, {signal}?)`。
`readFile` 返回标准 `ReadableStream<Uint8Array>`，内容保持原始 bytes，
按需拉取并支持背压。正常结束、错误和取消都会释放该读取的资源。
没有 `readEntry`、`resolve`、`validateClosure` 或 `close`。
打开阶段的信号不绑定返回对象生命周期，每次读取可另设信号。

固定 CID 保证内容身份，不保证内容永远可用。库不永久缓存快照；调用者负责保留 block。
打开后的 block 缺失或损坏会使后续读取失败，绝不会返回另一个版本的数据。
大附件可流式读取；通用 JSON Schema 校验仍需有界解析内存，不承诺无限日志流。

默认限额：总 block/解析 bytes 分别 64 MiB、16384 blocks、单 block 4 MiB、
2048 文件、深度 64、manifest 64 KiB、Schema 1 MiB、单数据文件 8 MiB、
128 Schema、4096 content refs、100000 JSON/Schema 遍历节点。
`options.limits` 可设更严格或更宽的正安全整数限额；独立 manifest/Schema
编码辅助函数保留 64 KiB/1 MiB 上限。Schema 解码和数据遍历仍受节点/深度限额约束。

## 验证

```sh
pnpm --filter @silvermoon-work/content-bundle typecheck
pnpm --filter @silvermoon-work/content-bundle test-coverage
pnpm exec eslint packages/content-bundle --max-warnings=0
pnpm --filter @silvermoon-work/content-bundle build
pnpm check
```
