import { zipSync, type Zippable } from "fflate";

import type { ArchiveEntry } from "../types";

/**
 * Packs the results into one ZIP.
 *
 * Stored, not deflated: every member is already a JPEG, WebP, AVIF or
 * OxiPNG-optimised PNG, so DEFLATE has nothing left to find and would only cost
 * the reader a second of CPU per megabyte to shave a fraction of a percent.
 * `level: 0` is therefore the honest setting rather than a shortcut.
 *
 * The timestamp is a parameter because the clock is not this layer's to read —
 * the same entries must produce the same bytes for the same instant. Note that
 * a ZIP records local time with no offset, so the caller passes the reader's
 * own `new Date()` and the archive reads correctly in the file manager that
 * opens it.
 */
export function buildZipArchive(
    entries: readonly ArchiveEntry[],
    generatedAt: Date,
): Uint8Array<ArrayBuffer> {
    const zippable: Zippable = {};

    for (const entry of entries) {
        zippable[entry.name] = [entry.bytes, { level: 0, mtime: generatedAt }];
    }

    return zipSync(zippable, { level: 0, mtime: generatedAt });
}
