/** Canonical AppState schema major version (State V2). */
export const APP_SCHEMA_VERSION = 2;

/** Chat HTTP contract — bump when breaking request/response shape. */
export const CHAT_API_VERSION = 1;

/** Supported chat API versions (inclusive). */
export const CHAT_API_SUPPORTED = [1] as const;
