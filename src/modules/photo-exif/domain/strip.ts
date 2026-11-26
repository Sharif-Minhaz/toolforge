import type {
    ContainerRewrite,
    MetadataKind,
    RemovedBlock,
    StripOptions,
    StripResult,
} from "../types";
import { METADATA_KINDS } from "../types";
import { MAX_PHOTO_BYTES } from "./constants";
import { detectPhotoFormat } from "./format";
import { rewriteJpeg } from "./jpeg";
import { rewritePng } from "./png";
import { rewriteWebp } from "./webp";

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;

    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
}

/** One line per kind, in a fixed order, so two runs over one file report identically. */
function summarise(removed: ContainerRewrite["removed"]): RemovedBlock[] {
    const totals = new Map<MetadataKind, RemovedBlock>();

    for (const block of removed) {
        const current = totals.get(block.kind);

        totals.set(block.kind, {
            kind: block.kind,
            count: (current?.count ?? 0) + 1,
            bytes: (current?.bytes ?? 0) + block.bytes,
        });
    }

    return METADATA_KINDS.flatMap((kind) => {
        const total = totals.get(kind);

        return total === undefined ? [] : [total];
    });
}

/**
 * The one entry point the island and the MCP adapter call to strip a photo:
 * the container rewritten without its metadata, the picture's own bytes
 * untouched. No decode, no canvas, no re-encode — so no quality is lost and
 * the result is byte-identical image data with less around it.
 */
export function stripPhoto(bytes: Uint8Array, options: StripOptions): StripResult {
    if (bytes.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (bytes.length > MAX_PHOTO_BYTES) {
        return { ok: false, reason: "too_large" };
    }

    const format = detectPhotoFormat(bytes);

    if (format === null) {
        return { ok: false, reason: "unsupported_format" };
    }

    if (format !== "jpeg" && format !== "png" && format !== "webp") {
        return { ok: false, reason: "unsupported_format", format };
    }

    const rewrite =
        format === "jpeg"
            ? rewriteJpeg(bytes, options)
            : format === "png"
              ? rewritePng(bytes, options)
              : rewriteWebp(bytes, options);

    if (rewrite === null) {
        return { ok: false, reason: "malformed", format };
    }

    return {
        ok: true,
        format,
        bytes: concat(rewrite.parts),
        removed: summarise(rewrite.removed),
        keptOrientation: rewrite.orientation,
        keptColorProfile: rewrite.hadColorProfile && options.keepColorProfile,
    };
}
