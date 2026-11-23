import type { CID } from "multiformats/cid";

export type JsonSchema = boolean | { readonly [key: string]: unknown };
export type ContentType =
  "application/json" | "application/yaml" | "application/jsonl";

export interface BundleManifest {
  readonly entry: {
    readonly path: string;
    readonly schemaCid: CID;
    readonly contentType: ContentType;
  };
}

export type ContentRef =
  | {
      readonly kind: "json" | "yaml" | "jsonl";
      readonly schemaCid: CID;
      readonly path: string;
    }
  | { readonly kind: "bundle"; readonly path: string };

export interface SchemaBlock {
  readonly cid: CID;
  readonly bytes: Uint8Array;
}

export interface BundleLimits {
  bytes: number;
  blocks: number;
  blockBytes: number;
  files: number;
  depth: number;
  manifestBytes: number;
  schemaBytes: number;
  documentBytes: number;
  schemas: number;
  references: number;
  nodes: number;
}

export interface OpenBundleOptions {
  resolveCid(cid: CID, options: { signal?: AbortSignal }): Promise<Uint8Array>;
  signal?: AbortSignal;
  limits?: Partial<BundleLimits>;
}

export interface ContentBundle {
  readonly cid: CID;
  readonly manifest: BundleManifest;
  readFile(
    path: string,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>>;
}

export type ContentBundleErrorCode =
  | "MANIFEST_INVALID"
  | "PATH_INVALID"
  | "REFERENCE_INVALID"
  | "SCHEMA_INVALID"
  | "CONTENT_INVALID"
  | "CONTENT_UNAVAILABLE"
  | "LIMIT_EXCEEDED"
  | "OPTIONS_INVALID"
  | "ABORTED";
