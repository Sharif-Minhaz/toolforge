import { boxBlur, lumaOf } from "./glyph-mask";
import { inpaintRegion } from "./inpaint";
import {
    ALPHA_FLOOR,
    ALPHA_UNBLEND_MAX,
    NEUTRAL_FILL_AGREES,
    NEUTRAL_FILL_DISAGREES,
    NEUTRAL_FILL_RADIUS_PX,
    NEUTRAL_OUTLINE_STEP,
} from "./video-constants";

/** A mark of one grey, in the coordinates of the patch it is being taken out of. */
export type NeutralOverlay = {
    /** How much of each pixel's brightness the mark covers, 0–1. */
    readonly alpha: Float32Array;
    /** How much of its colour, which a clip stores at half resolution. */
    readonly chroma: Float32Array;
    /** The grey itself, 0–255. */
    readonly color: number;
    /** `1` on every pixel the mark or its fringe reaches. */
    readonly touched: Uint8Array;
    /** `1` on the glyphs' own outline, from `outlineOf`. */
    readonly outline: Uint8Array;
};

/**
 * Where the opacity steps: the pixel a glyph's edge runs through.
 *
 * What is there belongs to no opacity — the codec's ringing at a hard edge, and
 * colour samples half on the mark and half off it — so it is rebuilt outright,
 * from recovered footage on both sides. One pixel and no more: measured against a
 * planted mark, a pixel wider on either side costs texture and buys nothing.
 */
export function outlineOf(alpha: Float32Array, width: number, height: number): Uint8Array {
    const opacity = alpha.reduce((most, value) => Math.max(most, value), 0);

    return Uint8Array.from(alpha, (here, index) => {
        const x = index % width;
        const y = (index - x) / width;
        const step = Math.max(
            x > 0 ? Math.abs((alpha[index - 1] ?? 0) - here) : 0,
            x < width - 1 ? Math.abs((alpha[index + 1] ?? 0) - here) : 0,
            y > 0 ? Math.abs((alpha[index - width] ?? 0) - here) : 0,
            y < height - 1 ? Math.abs((alpha[index + width] ?? 0) - here) : 0,
        );

        return step > 0 && step >= opacity * NEUTRAL_OUTLINE_STEP ? 1 : 0;
    });
}

/**
 * Takes a neutral mark back out of a patch of a frame.
 *
 * `removeOverlay` is the same job for a sparkle, and differs in three ways that
 * each come from what a wordmark is. Its grey is measured rather than assumed to
 * be white, so on footage brighter than the mark this *adds* light. Its strokes
 * are thin, so brightness and colour are recovered by different amounts. And it is
 * nearly all edge — so what decides between the recovered pixel and an invented
 * one is not opacity but **whether the two agree**.
 *
 * Mutates `pixels` in place. Alpha is never touched.
 */
export function removeNeutralOverlay(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    overlay: NeutralOverlay,
    passes: number,
): void {
    unblendNeutral(pixels, overlay);
    inpaintRegion(pixels, width, height, overlay.outline);

    const filled = Uint8ClampedArray.from(pixels);

    inpaintRegion(filled, width, height, overlay.touched, passes);
    settle(pixels, filled, width, height, overlay.touched);
}

function unblendNeutral(pixels: Uint8ClampedArray, { alpha, chroma, color }: NeutralOverlay): void {
    for (let index = 0; index < alpha.length; index += 1) {
        const offset = index * 4;
        const luma = lumaOf(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);

        // Bounded by the pixel itself: the footage under the mark was never
        // darker than black, so the mark never put in more light than is here.
        const covered = Math.min(alpha[index] ?? 0, ALPHA_UNBLEND_MAX, luma / color);
        const tinted = Math.min(chroma[index] ?? 0, ALPHA_UNBLEND_MAX);

        if (covered <= ALPHA_FLOOR && tinted <= ALPHA_FLOOR) {
            continue;
        }

        const under = (luma - covered * color) / (1 - covered);

        for (let channel = 0; channel < 3; channel += 1) {
            const tint = (pixels[offset + channel] ?? 0) - luma;

            pixels[offset + channel] = under + tint / (1 - tinted);
        }
    }
}

/**
 * Moves the recovered picture onto the filled one wherever they tell the same
 * story.
 *
 * Both are estimates of one thing and they fail differently. The recovered one
 * keeps the footage's texture and also the codec's ringing along every stroke,
 * which is what spells the name out again in outline. The filled one has neither.
 * Where they differ by a few levels the difference *is* the ringing, and the fill
 * is simply the cleaner answer; where they differ by many, the footage has
 * something in it that a fill cannot know, and the recovery is the only answer.
 *
 * Asked over a neighbourhood rather than of each pixel, because a single pixel of
 * ringing is as far from the fill as a single pixel of texture is.
 */
function settle(
    pixels: Uint8ClampedArray,
    filled: Uint8ClampedArray,
    width: number,
    height: number,
    touched: Uint8Array,
): void {
    const gap = Float32Array.from(touched, (value, index) => {
        if (value !== 1) {
            return 0;
        }

        let total = 0;

        for (let channel = 0; channel < 3; channel += 1) {
            const offset = index * 4 + channel;

            total += Math.abs((pixels[offset] ?? 0) - (filled[offset] ?? 0));
        }

        return total / 3;
    });

    // Dividing one blur by the other averages over the marked pixels alone.
    const gaps = boxBlur(gap, width, height, NEUTRAL_FILL_RADIUS_PX);
    const shares = boxBlur(Float32Array.from(touched), width, height, NEUTRAL_FILL_RADIUS_PX);
    const band = NEUTRAL_FILL_DISAGREES - NEUTRAL_FILL_AGREES;

    for (let index = 0; index < touched.length; index += 1) {
        const share = shares[index] ?? 0;

        if (touched[index] !== 1 || share <= 0) {
            continue;
        }

        const distance = (gaps[index] ?? 0) / share;
        const weight = Math.min(1, Math.max(0, (NEUTRAL_FILL_DISAGREES - distance) / band));

        for (let channel = 0; channel < 3; channel += 1) {
            const offset = index * 4 + channel;
            const recovered = pixels[offset] ?? 0;

            pixels[offset] = recovered + weight * ((filled[offset] ?? 0) - recovered);
        }
    }
}
