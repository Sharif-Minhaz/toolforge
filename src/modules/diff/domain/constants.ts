import type { DiffPrecision, DiffView } from "../types";

/**
 * Per side. Roughly a 200 KB source file — past this the browser is the wrong
 * place to be comparing, and the quadratic table below stops being free.
 */
export const MAX_DIFF_INPUT_LENGTH = 200_000;

/** Per side. Bounds the table together with {@link MAX_DIFF_CELLS}. */
export const MAX_DIFF_LINES = 5_000;

/**
 * The comparison table is one byte per cell, so this is a 4 MB ceiling on a
 * single run. Identical prefixes and suffixes are stripped before it is
 * measured, which is why two 5,000-line files that differ in the middle still
 * fit comfortably.
 */
export const MAX_DIFF_CELLS = 4_000_000;

/**
 * The same ceiling for one changed pair of lines. Far smaller because it runs
 * once per changed row: a pair of very long lines drops back to whole-line
 * highlighting rather than stalling the page.
 */
export const MAX_INLINE_CELLS = 40_000;

/** Unchanged lines kept either side of a change when the rest is folded away. */
export const COLLAPSE_CONTEXT_LINES = 3;

/** Rejected before it is read, so an oversized file never reaches memory. */
export const MAX_DIFF_FILE_BYTES = 512 * 1024;

/** Side-by-side is what "compare" means to most people, so it is the default. */
export const DEFAULT_DIFF_VIEW: DiffView = "split";

/** Word runs are legible without being noisy, unlike per-character tinting. */
export const DEFAULT_DIFF_PRECISION: DiffPrecision = "word";

/** Filenames written into the patch header. Data, not copy. */
export const PATCH_LEFT_LABEL = "original.txt";
export const PATCH_RIGHT_LABEL = "changed.txt";

/** One click fills both boxes with a pair that exercises every row type. */
export const SAMPLE_LEFT = `{
  "name": "toolforge",
  "version": "1.4.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "license": "MIT"
}`;

export const SAMPLE_RIGHT = `{
  "name": "toolforge",
  "version": "1.5.2",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "test": "bun test"
  },
  "license": "MIT"
}`;
