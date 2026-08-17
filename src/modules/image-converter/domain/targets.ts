import { BLACK_MATTE, WHITE_MATTE } from "@/modules/tools/domain/pixels";
import type { MatteColor, RasterFormat } from "@/modules/tools/types";
import { DEFAULT_ICON_SIZES } from "./constants";
import { FAVICON_ICO_SIZES, FAVICON_PNGS } from "./favicon";
import {
    BACKGROUND_CHOICES,
    type BackgroundChoice,
    type ConversionFailureReason,
    type ConversionOptions,
    type ConversionTarget,
    type IconSize,
} from "../types";

/**
 * The encoder a target writes with, or `null` when the target is not a raster
 * format at all. `ico` and `favicon` are containers, PNG all the way down;
 * `svg` is not pixels in the first place.
 */
export function targetFormat(target: ConversionTarget): RasterFormat | null {
    switch (target) {
        case "png":
        case "jpeg":
        case "webp":
        case "avif":
            return target;
        case "svg":
        case "ico":
        case "favicon":
            return null;
    }
}

/** True when the target writes one file rather than a set. */
export function isSingleFileTarget(target: ConversionTarget): boolean {
    return target !== "favicon";
}

/**
 * Whether the quality slider changes anything.
 *
 * The three lossy encoders spend it on the quantiser. SVG spends it on the
 * trace — how small a speck survives and how closely an outline follows the
 * pixel staircase — which is the same bargain in a different currency: more
 * detail, more bytes. PNG is written losslessly and the two icon targets are
 * PNG underneath, so for those three the control is disabled with a hint saying
 * why rather than left live and ignored.
 */
export function qualityApplies(target: ConversionTarget): boolean {
    return target === "jpeg" || target === "webp" || target === "avif" || target === "svg";
}

/**
 * The longest-edge cap is meaningless when the target picks its own sizes — and
 * a vector has no size to cap. An SVG traced from a 4000-pixel photograph and
 * one traced from a 400-pixel copy of it both scale to any size on the page;
 * what changes is how much detail the trace found, and the quality slider is
 * already the control for that.
 */
export function resizeApplies(target: ConversionTarget): boolean {
    return targetFormat(target) !== null;
}

/** Only a plain `.ico` lets the reader choose; the pack's sizes are fixed. */
export function iconSizesApply(target: ConversionTarget): boolean {
    return target === "ico";
}

/** Only a traced drawing has a palette to size. */
export function colorsApply(target: ConversionTarget): boolean {
    return target === "svg";
}

/**
 * The background values this target can honour.
 *
 * JPEG has no alpha channel, so `transparent` is removed from the list rather
 * than offered and then quietly turned into white. That is the one rule; every
 * other target keeps all three.
 */
export function backgroundValues(target: ConversionTarget): readonly BackgroundChoice[] {
    return target === "jpeg"
        ? BACKGROUND_CHOICES.filter((choice) => choice !== "transparent")
        : BACKGROUND_CHOICES;
}

/**
 * The colour transparency is composited onto, or `null` to keep the alpha.
 *
 * The JPEG fallback is for a hand-edited link naming `background=transparent`
 * with `target=jpeg`, which the control itself cannot produce. White rather
 * than black because an encoder handed transparent pixels leaves black behind,
 * and black is the outcome people report as a bug.
 */
export function resolveBackground(
    target: ConversionTarget,
    choice: BackgroundChoice,
): MatteColor | null {
    if (choice === "white") {
        return WHITE_MATTE;
    }

    if (choice === "black") {
        return BLACK_MATTE;
    }

    return target === "jpeg" ? WHITE_MATTE : null;
}

/**
 * The square edges a target will write, smallest first.
 *
 * The empty fallback cannot come from the control — it refuses to clear its
 * last entry — but a hand-edited link can carry one, and defaulting is better
 * than converting a file into nothing.
 */
export function resolveIconSizes(options: ConversionOptions): readonly IconSize[] {
    if (options.target === "favicon") {
        return FAVICON_ICO_SIZES;
    }

    if (options.target !== "ico") {
        return [];
    }

    const chosen = [...new Set(options.iconSizes)].toSorted((a, b) => a - b);

    return chosen.length > 0 ? chosen : DEFAULT_ICON_SIZES;
}

/**
 * A stable key for the settings a result was produced under.
 *
 * Built from only the options that reach this target, so nudging the quality
 * slider while PNG is selected does not mark every finished row stale for a
 * change that cannot alter a single byte. That is what makes staleness
 * derivable instead of stored: a row carries the signature it was written
 * under, and a row whose signature no longer matches the panel is dimmed rather
 * than silently redone.
 */
export function optionsSignature(options: ConversionOptions): string {
    const parts: string[] = [options.target, `b${options.background}`];

    if (qualityApplies(options.target)) {
        parts.push(`q${options.quality}`);
    }

    if (resizeApplies(options.target)) {
        parts.push(`e${options.maxEdge ?? "original"}`);
    }

    if (iconSizesApply(options.target)) {
        parts.push(`s${resolveIconSizes(options).join("-")}`);
    }

    if (colorsApply(options.target)) {
        parts.push(`c${options.colors}`);
    }

    return parts.join(":");
}

/**
 * The size an SVG *source* is drawn at before anything else happens to it.
 *
 * A vector has no pixels until somebody picks a number, and the number that
 * matters is whatever the chosen target is about to ask for. A raster target
 * asks for the size cap, or for the file's own declared size when there is no
 * cap. An icon target asks for the largest square it is going to write, so the
 * biggest icon comes from a fresh rasterisation rather than from an enlargement
 * of a smaller one. `null` means "whatever the file says", and the SVG target
 * never asks at all — an SVG wanted as an SVG is copied, not redrawn.
 */
export function svgRenderEdge(options: ConversionOptions): number | null {
    if (targetFormat(options.target) !== null) {
        return options.maxEdge;
    }

    if (options.target === "svg") {
        return null;
    }

    const squares = [
        ...resolveIconSizes(options),
        ...(options.target === "favicon" ? FAVICON_PNGS.map((png) => png.size) : []),
    ];

    return squares.length === 0 ? null : Math.max(...squares);
}

/** What the queue rule needs to know about one row. */
export type ConversionQueueRow = {
    /** True once a conversion has produced files for this row. */
    readonly hasResult: boolean;
    /** Why the last attempt failed, or `null` if it did not fail. */
    readonly reason: ConversionFailureReason | null;
    /** The settings the last attempt ran under, or `null` before the first. */
    readonly signature: string | null;
};

/**
 * Whether pressing Convert should touch this row.
 *
 * A row that already produced files is never run again by the batch button,
 * not even once the panel has moved on. The reader asked for that result under
 * the settings that were live at the time, and dropping a second file in with
 * a different target is not a request to spend another conversion replacing the
 * first one. Redoing a finished row is its own per-row button.
 *
 * A failure is retried only when it is the encoder's own refusal *and* a
 * setting has moved since, so the same file cannot fail against the same
 * options twice for one press.
 */
export function needsWork(row: ConversionQueueRow, signature: string): boolean {
    if (row.hasResult) {
        return false;
    }

    if (row.reason !== null) {
        return isRetryableFailure(row.reason) && row.signature !== signature;
    }

    return true;
}

export function clampQuality(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Whether a failed file is worth attempting again when the settings change.
 *
 * Only the encoder's own refusal is: another target may well succeed where one
 * codec would not. Everything else is a fact about the file — it is empty, it
 * is not an image, it is too big, it holds too many pixels — and no control on
 * this page changes any of those, so retrying would only spend the reader's
 * time to show them the same message.
 */
export function isRetryableFailure(reason: ConversionFailureReason): boolean {
    return reason === "encode_failed";
}
