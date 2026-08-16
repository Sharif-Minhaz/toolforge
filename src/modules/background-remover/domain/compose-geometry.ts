import type { PixelSize } from "@/modules/tools/types";

import { BLUR_OVERSCAN_FACTOR, MAX_BLUR_SHARE } from "./constants";

/**
 * The arithmetic behind putting one picture behind another.
 *
 * Pure, and separated from `canvas.ts` on purpose: every defect this file exists
 * to prevent — a background letterboxed instead of filled, a blur with a pale
 * halo around the frame, a strength that means something different on every
 * picture — is a wrong number rather than a wrong `drawImage`, and a wrong number
 * is testable without a DOM.
 */

export type Rect = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

/**
 * Where to draw `source` so it **covers** `target` completely, centred.
 *
 * Cover rather than contain, which is the whole point: a background that is
 * letterboxed shows the canvas through the bars, and the canvas behind a cut-out
 * is transparent — so `object-fit: contain` on a background does not produce a
 * framed picture, it produces two transparent stripes the reader has to discover
 * after they download it.
 *
 * The overflow is split evenly, so a portrait background behind a landscape
 * picture keeps its middle rather than its top.
 */
export function coverRect(source: PixelSize, target: PixelSize): Rect {
    if (source.width <= 0 || source.height <= 0) {
        // A degenerate source cannot be scaled by ratio; filling the frame is the
        // harmless answer, and it keeps callers from having to handle a null.
        return { x: 0, y: 0, width: target.width, height: target.height };
    }

    const scale = Math.max(target.width / source.width, target.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;

    return {
        x: (target.width - width) / 2,
        y: (target.height - height) / 2,
        width,
        height,
    };
}

/**
 * The blur radius, in real pixels, for a 1–100 strength on a given picture.
 *
 * Tied to the **shorter** side rather than the longer one or the diagonal: what
 * the eye reads as "how out of focus is this" tracks the smaller dimension, so a
 * panorama blurred by its width would come back looking untouched.
 *
 * Rounded, because `ctx.filter = "blur(7.42px)"` is legal but no browser gives
 * a fractional radius a distinct result, and a whole number is what the article
 * can honestly quote.
 */
export function blurRadiusPx(size: PixelSize, strength: number, share = MAX_BLUR_SHARE): number {
    const shorterSide = Math.max(0, Math.min(size.width, size.height));
    const clamped = Math.min(100, Math.max(0, strength));

    return Math.round((clamped / 100) * shorterSide * share);
}

/**
 * Where to draw a picture that is about to be blurred, so the blur has real
 * pixels to sample at every edge of the frame.
 *
 * Grown by `BLUR_OVERSCAN_FACTOR × radius` on all four sides and re-centred. Skip
 * this and a Gaussian at the frame's edge averages the picture against the
 * transparent nothing outside it, which draws a pale border around the entire
 * background — the single most recognisable way a hand-rolled portrait-mode
 * effect looks wrong.
 *
 * A zero radius returns the frame unchanged, so the no-blur path costs nothing.
 */
export function overscanRect(
    frame: PixelSize,
    radius: number,
    factor = BLUR_OVERSCAN_FACTOR,
): Rect {
    const bleed = Math.max(0, Math.round(radius * factor));

    return {
        // `0 - bleed` rather than `-bleed`, so a zero radius gives positive zero.
        // `Object.is(-0, 0)` is false, and a `-0` here makes a structural
        // comparison of two identical rectangles report them as different.
        x: 0 - bleed,
        y: 0 - bleed,
        width: frame.width + bleed * 2,
        height: frame.height + bleed * 2,
    };
}

/**
 * Composes the two: a background drawn to cover a frame that has been grown for
 * the blur to eat into.
 *
 * One function rather than two calls at the site, because the mistake is not
 * getting either one wrong — it is applying the cover fit to the *frame* and then
 * overscanning the result, which scales the picture up and then scales it up
 * again, so the reader's background arrives cropped to its middle third.
 */
export function blurredBackgroundRect(
    source: PixelSize,
    frame: PixelSize,
    radius: number,
    factor = BLUR_OVERSCAN_FACTOR,
): Rect {
    const grown = overscanRect(frame, radius, factor);
    const placed = coverRect(source, { width: grown.width, height: grown.height });

    return {
        x: grown.x + placed.x,
        y: grown.y + placed.y,
        width: placed.width,
        height: placed.height,
    };
}

/**
 * The size the segmentation runs at, with the aspect ratio kept.
 *
 * Returns the size unchanged when it already fits, so the common case — anything
 * off a phone that has been through this site's resizer — is not resampled for no
 * reason. Never returns a zero side: a 4000×1 strip capped at 2048 would round
 * its height to nothing, and a zero-height canvas throws rather than degrading.
 */
export function segmentationSize(size: PixelSize, maxSide: number): PixelSize {
    const longest = Math.max(size.width, size.height);

    if (longest <= maxSide || longest <= 0) {
        return size;
    }

    const scale = maxSide / longest;

    return {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
    };
}
