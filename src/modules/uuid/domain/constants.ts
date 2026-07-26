import type { UuidVersion } from "../types";

export const MIN_UUID_QUANTITY = 1;

/** Hard ceiling — keeps a single batch cheap enough to stay on the main thread. */
export const MAX_UUID_QUANTITY = 500;

export const DEFAULT_UUID_VERSION: UuidVersion = 4;

export const DEFAULT_UUID_QUANTITY = 1;

export const UUID_QUANTITY_PRESETS = [1, 5, 10, 25, 100, 500] as const;

/** Canonical 8-4-4-4-12 lowercase hex form. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
