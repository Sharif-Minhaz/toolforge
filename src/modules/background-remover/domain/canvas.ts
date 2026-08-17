import { loadImage } from "@/modules/tools/domain/image-element";
import { fitWithinEdge } from "@/modules/tools/domain/pixels";
import type { PixelSize } from "@/modules/tools/types";

import type { BackgroundChoice, CompositeFormat } from "../types";
import { blurRadiusPx, blurredBackgroundRect, coverRect, scaleFactor } from "./compose-geometry";
import { MAX_BLUR_RENDER_SIDE, MAX_COMPOSITE_SIDE, MAX_SEGMENTATION_SIDE } from "./constants";
import { COMPOSITE_MIME_TYPES, COMPOSITE_QUALITY, keepsAlpha } from "./filenames";

/**
 * Everything that needs a canvas.
 *
 * The arithmetic all lives in `compose-geometry.ts` and is unit-tested; this file
 * is the `drawImage` calls it feeds, plus the three browser facts that are not
 * obvious and each cost something to discover:
 *
 * 1. **A cross-origin background taints the canvas** unless the element asked for
 *    CORS *before* it loaded. `toBlob` on a tainted canvas throws
 *    `SecurityError`, and it throws at download time — long after the reader
 *    picked the photograph and saw it composited on screen.
 * 2. **`ctx.filter` is reset by nothing.** Left set, it blurs the cut-out that is
 *    drawn next, which reads as the model having failed.
 * 3. **A format with no alpha channel does not flatten onto white.** It flattens
 *    onto black, because that is what transparent pixels are once the channel is
 *    dropped, and a JPEG of somebody's cut-out portrait comes back on a black
 *    rectangle.
 * 4. **A canvas is not freed when the last reference to it goes.** Its backing
 *    store is four bytes a pixel of memory the garbage collector releases
 *    whenever it feels like it — which, at 48 MB a canvas and one allocated per
 *    slider step, is far too late. `release` below is what makes it prompt.
 */

/** Everything a canvas here is created through, so the settings are set once. */
function createCanvas(size: PixelSize): HTMLCanvasElement | null {
    if (size.width <= 0 || size.height <= 0) {
        return null;
    }

    const canvas = document.createElement("canvas");

    canvas.width = size.width;
    canvas.height = size.height;

    return canvas;
}

/**
 * Hands a canvas's memory back now rather than at the next collection.
 *
 * Trap 4, and the one that took a reader's laptop down. Dropping the last
 * reference to a canvas makes it *collectable*, not collected — and a background
 * remover allocates one per redraw, which is one per step of a slider drag. A
 * dozen twelve-megapixel canvases waiting on the collector is half a gigabyte
 * that the tab is charged for and cannot use.
 *
 * Setting either dimension to zero releases the backing store immediately, in
 * every engine, and is the documented way to do it. Every canvas made here is
 * either returned to a caller that releases it or released before this module
 * lets go of it.
 */
export function releaseCanvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === null) {
        return;
    }

    canvas.width = 0;
    canvas.height = 0;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext("2d");

    if (ctx === null) {
        return null;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    return ctx;
}

/**
 * Loads a picture the browser is allowed to read back out of a canvas.
 *
 * `crossOrigin` is assigned before `src`, which `loadImage` guarantees by
 * assigning `src` last. Set it afterwards and the browser has already begun a
 * request without the `Origin` header, so the response arrives without
 * `Access-Control-Allow-Origin` and the canvas is tainted anyway — a bug that
 * looks like the CDN being misconfigured.
 *
 * Pexels' image host answers `access-control-allow-origin: *`, which is what
 * makes a stock background compositable at all; a host that does not would fail
 * to load here rather than silently poisoning the download.
 */
export function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
    return loadImage(url, () => {
        const image = new Image();

        image.crossOrigin = "anonymous";

        return image;
    });
}

/**
 * The picture, scaled down to what the model is handed, **as a PNG blob**.
 *
 * A blob rather than the `ImageData` that is right there on the canvas, and the
 * reason is a trap in the library rather than a preference.
 *
 * `ImageSource` is declared as `ImageData | ArrayBuffer | Uint8Array | Blob |
 * URL | string`, but `imageSourceToImageData` only ever *converts* the last
 * four: a string becomes a URL, a URL is fetched into a blob, a buffer is
 * wrapped in a blob, and a blob is decoded. An `ImageData` matches none of those
 * branches, falls through the whole function and is returned unchanged with a
 * cast — after which `runInference` destructures `imageTensor.shape`, which an
 * `ImageData` does not have, and throws on `undefined`. The type says it is
 * supported; the code has no path for it.
 *
 * So the encode is not waste, it is the supported contract. It costs one PNG of
 * an image already capped at `MAX_SEGMENTATION_SIDE` — noise beside an inference
 * that runs single-threaded whenever the page is not cross-origin isolated.
 *
 * See `computeAlphaMask` in `removal.ts` for why this is scaled down at all.
 */
export function toSegmentationInput(
    source: CanvasImageSource,
    size: PixelSize,
    maxSide = MAX_SEGMENTATION_SIDE,
): Promise<Blob | null> {
    const target = fitWithinEdge(size, maxSide);
    const canvas = createCanvas(target);
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        return Promise.resolve(null);
    }

    ctx.drawImage(source, 0, 0, target.width, target.height);

    return new Promise((resolve) => {
        // PNG, and lossless on purpose: this is what the segmentation reads, so
        // JPEG ringing around the subject would be baked into the mask edge —
        // the one part of the output anybody inspects.
        canvas.toBlob((blob) => {
            releaseCanvas(canvas);
            resolve(blob);
        }, "image/png");
    });
}

/** The size the finished picture is written at, which is not always the source's. */
export function compositeSize(size: PixelSize, maxSide = MAX_COMPOSITE_SIDE): PixelSize {
    return fitWithinEdge(size, maxSide);
}

export type ComposeInput = {
    /** The decoded original, for the subject and for the blur. */
    readonly source: CanvasImageSource;
    /** The size to write at — `compositeSize`, not necessarily the source's. */
    readonly size: PixelSize;
    /** The model's alpha channel, scaled to `size` as it is applied. */
    readonly mask: CanvasImageSource;
    readonly background: BackgroundChoice;
    /**
     * Decoded background photograph, when `background.kind` is `"image"`. Loaded
     * by the caller so a failure to fetch it is reported beside the picker rather
     * than as a failed composite.
     */
    readonly backgroundImage: HTMLImageElement | null;
    readonly format: CompositeFormat;
};

/**
 * The finished picture: background, then subject, then bytes.
 *
 * Two canvases, both released before this returns. That is the whole memory
 * story and it is not optional — see trap 4. The cut-out is built here rather
 * than kept between redraws for the same reason: holding one per open slot would
 * trade a draw call, which is free on the GPU, for tens of megabytes per slot
 * that sit there while the reader works on a different picture.
 *
 * Resolves `null` on any browser refusal rather than throwing, so the island has
 * one failure to map instead of a `try` around every step.
 */
export async function composeResult(input: ComposeInput): Promise<Blob | null> {
    const { source, size, mask, background, backgroundImage, format } = input;
    const canvas = createCanvas(size);
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        releaseCanvas(canvas);

        return null;
    }

    /**
     * The subject alone, with the model's alpha applied.
     *
     * `destination-in` keeps the destination's colour and multiplies its alpha
     * by the source's, which is precisely "cut this shape out of that picture" —
     * one composited draw rather than a walk over several million pixels in
     * JavaScript. The mask is scaled to `size` by the same bilinear filter the
     * browser uses for every other `drawImage`.
     */
    const cutout = createCanvas(size);
    const cutoutCtx = cutout === null ? null : context2d(cutout);

    if (cutout === null || cutoutCtx === null) {
        releaseCanvas(canvas);
        releaseCanvas(cutout);

        return null;
    }

    cutoutCtx.drawImage(source, 0, 0, size.width, size.height);
    cutoutCtx.globalCompositeOperation = "destination-in";
    cutoutCtx.drawImage(mask, 0, 0, size.width, size.height);
    cutoutCtx.globalCompositeOperation = "source-over";

    // Trap 3. Painted before the background rather than instead of it, so a
    // partially transparent background — a PNG somebody dropped in — lands on
    // white too rather than on black.
    if (!keepsAlpha(format)) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size.width, size.height);
    }

    paintBackground(ctx, { source, size, background, backgroundImage });

    ctx.drawImage(cutout, 0, 0, size.width, size.height);
    releaseCanvas(cutout);

    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => {
                releaseCanvas(canvas);
                resolve(blob);
            },
            COMPOSITE_MIME_TYPES[format],
            // Ignored by the PNG encoder, which is lossless, and read by the
            // other two.
            COMPOSITE_QUALITY,
        );
    });
}

/**
 * The picture's own background, out of focus, drawn onto the frame.
 *
 * Blurred **small and scaled up**, which is the difference between a redraw the
 * reader does not notice and several seconds of frozen tab. `ctx.filter` with a
 * large radius across several megapixels is one of the most expensive things a
 * 2D canvas can be asked to do, and every millisecond of it is main-thread time.
 *
 * It also buys nothing. A blur *is* the destruction of fine detail — there is
 * nothing left in the result that a quarter-size copy could not carry, so
 * blurring at `MAX_BLUR_RENDER_SIDE` and letting `drawImage` scale it back is
 * visually the same picture for a fraction of the work. The radius is scaled by
 * the same factor, so the apparent strength does not change with the source's
 * dimensions.
 *
 * The overscan is still computed on the small canvas, for the reason it always
 * was: a blur at the edge of a canvas averages the picture against the nothing
 * outside it and draws a pale border around the whole photograph.
 */
function paintBlurredBackground(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    size: PixelSize,
    strength: number,
): void {
    const small = fitWithinEdge(size, MAX_BLUR_RENDER_SIDE);
    const scale = scaleFactor(size, small);
    const radius = Math.max(1, Math.round(blurRadiusPx(size, strength) * scale));
    const rect = blurredBackgroundRect(small, small, radius);

    const canvas = createCanvas(small);
    const smallCtx = canvas === null ? null : context2d(canvas);

    if (canvas === null || smallCtx === null) {
        releaseCanvas(canvas);

        return;
    }

    // Trap 2. Set, drawn through, and cleared in the same three lines, so there
    // is no path where a later draw inherits it.
    smallCtx.filter = `blur(${radius}px)`;
    smallCtx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    smallCtx.filter = "none";

    ctx.drawImage(canvas, 0, 0, size.width, size.height);
    releaseCanvas(canvas);
}

function paintBackground(
    ctx: CanvasRenderingContext2D,
    input: Pick<ComposeInput, "source" | "size" | "background" | "backgroundImage">,
): void {
    const { source, size, background, backgroundImage } = input;

    switch (background.kind) {
        case "transparent":
            return;

        case "color":
            ctx.fillStyle = background.color;
            ctx.fillRect(0, 0, size.width, size.height);

            return;

        case "blur": {
            paintBlurredBackground(ctx, source, size, background.strength);

            return;
        }

        case "image": {
            if (backgroundImage === null) {
                return;
            }

            const rect = coverRect(
                { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight },
                size,
            );

            ctx.drawImage(backgroundImage, rect.x, rect.y, rect.width, rect.height);

            return;
        }
    }
}
