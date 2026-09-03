import type { BoxCorner, NormalizedBox, PixelBox, PixelSize, WatermarkProfile } from "../types";
import {
    addFrameSample,
    createFrameAccumulator,
    detectWatermark,
    filledProfile,
} from "./glyph-mask";
import { applyRepaint, planRepaint } from "./repaint-plan";
import { planCornerBox, toPixelBox } from "./watermark-box";

/** What was done to the picture, once it has been done. */
export type GeminiPixelReport = {
    /** The rectangle that was written to, in the picture's own pixels. */
    readonly repainted: PixelBox;
    /** Share of the search box the mark turned out to occupy. */
    readonly coverage: number;
};

export type GeminiPixelResult =
    | { readonly ok: true; readonly report: GeminiPixelReport }
    | { readonly ok: false; readonly reason: "mark_not_found" };

/** Lifts one rectangle out of an RGBA buffer. Rows are contiguous; columns are not. */
function cropRgba(pixels: Uint8ClampedArray, size: PixelSize, box: PixelBox): Uint8ClampedArray {
    const out = new Uint8ClampedArray(box.width * box.height * 4);

    for (let row = 0; row < box.height; row += 1) {
        const from = ((box.y + row) * size.width + box.x) * 4;

        out.set(pixels.subarray(from, from + box.width * 4), row * box.width * 4);
    }

    return out;
}

/** Writes one rectangle back, in place. The inverse of `cropRgba`, same geometry. */
function blitRgba(
    pixels: Uint8ClampedArray,
    size: PixelSize,
    box: PixelBox,
    patch: Uint8ClampedArray,
): void {
    for (let row = 0; row < box.height; row += 1) {
        const stride = box.width * 4;

        pixels.set(
            patch.subarray(row * stride, row * stride + stride),
            ((box.y + row) * size.width + box.x) * 4,
        );
    }
}

/**
 * The detector, handed the one sample a still has.
 *
 * `FrameAccumulator` is the clip half's shape and it is the right one here too:
 * an average of one is the sample itself, and going through it means the still
 * and the clip are measured by exactly the same code rather than by two
 * estimators that could drift apart.
 */
function measureCorner(corner: Uint8ClampedArray, box: PixelBox): WatermarkProfile | null {
    const accumulator = createFrameAccumulator(box.width, box.height);

    addFrameSample(accumulator, corner);

    const detection = detectWatermark(accumulator);

    return detection.ok ? detection.profile : null;
}

/**
 * Takes Gemini's sparkle back out of a still, with no model and no network.
 *
 * The whole tool is one equation and its inverse. A generator does not draw over
 * the picture, it *blends* into it — `o = (1 − a)·b + a·W`, the picture `b` still
 * there under white `W` laid on at strength `a` — so wherever `a` is known, the
 * picture comes back as `b = (o − a·W)/(1 − a)`: texture, grain and all, rather
 * than a plausible invention in the shape of the mark.
 *
 * What differs from the clip half is only where `a` comes from. A clip offers two
 * dozen moments of moving footage, and everything that moves averages away until
 * only the fixed mark is standing. A still offers one moment, so the estimate has
 * to come from the corner's own smoothness instead: the picture under the mark is
 * rebuilt from the ring of picture around it, and the difference between that
 * surface and what is actually there is the mark. That is the same background fit
 * the clip half runs — run once, on the only sample there is.
 *
 * The consequence is worth stating rather than hiding. A mark sitting on sky or a
 * wall is recovered essentially exactly; a mark sitting on high-frequency
 * detail — foliage, a crowd, text — gives a background estimate with real error
 * in it, and the un-blend divides that error by `1 − a`. That is what the
 * cross-fade to a rebuilt fill in `removeOverlay` exists for, and it is why the
 * whole-box escape hatch is a control the reader can reach.
 *
 * Mutates `pixels` in place. No canvas, no DOM, no clock: everything here is
 * arithmetic over a buffer, so the whole of it is testable without a browser.
 */
export function cleanGeminiPixels(
    pixels: Uint8ClampedArray,
    size: PixelSize,
    box: NormalizedBox,
    fillWholeBox: boolean,
): GeminiPixelResult {
    const found = findGeminiMark(pixels, size, box, fillWholeBox);

    if (found === null) {
        return { ok: false, reason: "mark_not_found" };
    }

    const report = applyGeminiMark(pixels, size, found);

    return report === null ? { ok: false, reason: "mark_not_found" } : { ok: true, report };
}

/** A mark that has been found, and everything needed to take it back out. */
export type GeminiMark = {
    /** The square it was found in, in the picture's own pixels. */
    readonly searchBox: PixelBox;
    readonly profile: WatermarkProfile;
};

/**
 * Looks for a mark inside one box. `null` when there is nothing there.
 *
 * Split out from the removal so the corner search can ask the same question four
 * times without repainting anything, and so a caller that already knows where
 * the mark is does not pay for a second detection.
 */
export function findGeminiMark(
    pixels: Uint8ClampedArray,
    size: PixelSize,
    box: NormalizedBox,
    fillWholeBox = false,
): GeminiMark | null {
    const searchBox = toPixelBox(box, size);

    if (searchBox.width < 3 || searchBox.height < 3) {
        return null;
    }

    if (fillWholeBox) {
        return { searchBox, profile: filledProfile(searchBox.width, searchBox.height) };
    }

    const profile = measureCorner(cropRgba(pixels, size, searchBox), searchBox);

    return profile === null ? null : { searchBox, profile };
}

/** Takes a found mark back out of the picture, in place. `null` if it reaches nothing. */
export function applyGeminiMark(
    pixels: Uint8ClampedArray,
    size: PixelSize,
    mark: GeminiMark,
): GeminiPixelReport | null {
    const plan = planRepaint(mark.profile, mark.searchBox, size);

    if (plan === null) {
        return null;
    }

    const patch = cropRgba(pixels, size, plan.work);

    applyRepaint(patch, plan);
    blitRgba(pixels, size, plan.work, patch);

    return { repainted: plan.work, coverage: mark.profile.coverage };
}

/**
 * The corner search, and the reason this tab does not ask the reader where to
 * look.
 *
 * A generator's mark sits in a corner, but *which* corner is a fact about the
 * generator and its version rather than about the file — Gemini has signed
 * bottom-left and bottom-right at different times, Veo signs bottom-right, and
 * an image that has been cropped or rotated since is signed wherever it ended
 * up. A default corner is therefore wrong for somebody, and the somebody it is
 * wrong for gets `mark_not_found` on a picture that plainly has a mark in it.
 *
 * So all four are measured and the strongest wins. `peak` is the score — how far
 * the brightest found pixel stood above its own surroundings — because that is
 * the quantity a white mark maximises and a gradient does not: `detectWatermark`
 * has already refused anything below its own floor or outside its coverage
 * bounds, so every candidate reaching the comparison is at least mark-shaped.
 *
 * Bottom corners are tried first, and a tie goes to the earlier one. Ties are
 * not the interesting case; the order is what makes the answer deterministic.
 */
export const GEMINI_CORNER_ORDER: readonly BoxCorner[] = [
    "bottom-right",
    "bottom-left",
    "top-right",
    "top-left",
];

export type GeminiScan = GeminiMark & {
    readonly corner: BoxCorner;
    readonly box: NormalizedBox;
};

export function scanGeminiCorners(pixels: Uint8ClampedArray, size: PixelSize): GeminiScan | null {
    let best: GeminiScan | null = null;

    for (const corner of GEMINI_CORNER_ORDER) {
        const box = planCornerBox(size, corner);
        const found = findGeminiMark(pixels, size, box);

        if (found === null) {
            continue;
        }

        if (best === null || found.profile.peak > best.profile.peak) {
            best = { ...found, corner, box };
        }
    }

    return best;
}
