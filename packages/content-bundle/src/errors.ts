import type { ContentBundleErrorCode } from "./types.js";

export class ContentBundleError extends Error {
  override readonly name = "ContentBundleError";

  constructor(
    readonly code: ContentBundleErrorCode,
    message: string,
    readonly path = "",
    readonly pointer = "",
    readonly referenceChain: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
