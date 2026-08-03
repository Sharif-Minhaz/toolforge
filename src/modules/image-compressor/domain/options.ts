import type { RasterFormat } from "@/modules/tools/types";
import { MAX_QUALITY, MIN_QUALITY } from "./constants";
import type { CompressionFailureReason, CompressionOptions, OutputFormat } from "../types";

export function clampQuality(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_QUALITY;
    }

    return Math.min(Math.max(Math.round(value), MIN_QUALITY), MAX_QUALITY);
}

/**
 * What `auto` means for a given input.
 *
 * GIF and BMP are decodable but never written back as themselves — an animated
 * GIF loses its frames either way, and nothing is gained by writing a BMP — so
 * both land on PNG, which is at least lossless. Anything unrecognised does too,
 * because PNG is the only choice that cannot make a picture worse.
 */
export function formatForSourceType(sourceType: string): RasterFormat {
    switch (sourceType) {
        case "image/jpeg":
            return "jpeg";
        case "image/webp":
            return "webp";
        case "image/avif":
            return "avif";
        default:
            return "png";
    }
}

export function isLosslessFormat(format: RasterFormat): boolean {
    return format === "png";
}

/**
 * The formats a single file will actually be encoded to.
 *
 * One entry for every choice but `smallest`, which returns the whole candidate
 * list for the caller to encode and compare. Two rules shape that list: JPEG is
 * only a candidate for an opaque image, because it has no alpha channel and
 * flattening is a decision the reader should make rather than have made for
 * them; and PNG only competes when the source was already lossless, since on a
 * photograph it loses by an order of magnitude and would cost an encode to
 * prove it.
 */
export function candidateFormats(
    format: OutputFormat,
    sourceType: string,
    opaque: boolean,
): readonly RasterFormat[] {
    if (format === "auto") {
        return [formatForSourceType(sourceType)];
    }

    if (format !== "smallest") {
        return [format];
    }

    const candidates: RasterFormat[] = ["webp", "avif"];

    if (opaque) {
        candidates.push("jpeg");
    }

    if (isLosslessFormat(formatForSourceType(sourceType))) {
        candidates.push("png");
    }

    return candidates;
}

/**
 * Whether the quality slider changes anything for this choice of format.
 *
 * `auto` is deliberately absent from the `false` branch: it depends on which
 * files are in the queue, and the workbench answers that separately so the
 * control is only ever disabled when it is certain to do nothing.
 */
export function qualityApplies(format: OutputFormat): boolean {
    return format !== "png";
}

/**
 * A stable key for the settings a result was produced under.
 *
 * This is what makes staleness derivable instead of stored: a finished row
 * carries the signature it was encoded with, and a row whose signature no
 * longer matches the panel is dimmed rather than silently re-encoded.
 */
export function optionsSignature(options: CompressionOptions): string {
    return `${options.format}:${options.quality}:${options.maxEdge ?? "original"}`;
}

/** What the queue rule needs to know about one row. */
export type CompressionQueueRow = {
    /** True once an encode has produced a file for this row. */
    readonly hasResult: boolean;
    /** Why the last attempt failed, or `null` if it did not fail. */
    readonly reason: CompressionFailureReason | null;
    /** The settings the last attempt ran under, or `null` before the first. */
    readonly signature: string | null;
};

/**
 * Whether pressing Compress should touch this row.
 *
 * A row that already produced a file is never run again by the batch button,
 * not even once the panel has moved on. The reader asked for that result under
 * the settings that were live at the time, and dropping a second file in with
 * a different quality is not a request to spend another encode replacing the
 * first one. Redoing a finished row is its own per-row button.
 *
 * A failure is retried only when it is the encoder's own refusal *and* a
 * setting has moved since, so the same file cannot fail against the same
 * options twice for one press.
 */
export function needsWork(row: CompressionQueueRow, signature: string): boolean {
    if (row.hasResult) {
        return false;
    }

    if (row.reason !== null) {
        return isRetryableFailure(row.reason) && row.signature !== signature;
    }

    return true;
}

/**
 * Whether a failed file is worth attempting again when the settings change.
 *
 * Only the encoder's own refusal is: a different format may well succeed where
 * one codec would not. Everything else is a fact about the file — it is empty,
 * it is not an image, it is too big, it holds too many pixels — and no setting
 * on this page changes any of those, so retrying would only spend the reader's
 * time to show them the same message.
 */
export function isRetryableFailure(reason: CompressionFailureReason): boolean {
    return reason === "encode_failed";
}
