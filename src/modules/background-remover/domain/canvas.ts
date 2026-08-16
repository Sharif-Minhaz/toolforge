import { loadImage } from "@/modules/tools/domain/image-element";
import type { PixelSize } from "@/modules/tools/types";

import type { BackgroundChoice, CompositeFormat } from "../types";
import {
    blurRadiusPx,
    blurredBackgroundRect,
    coverRect,
    segmentationSize,
} from "./compose-geometry";
import { MAX_SEGMENTATION_SIDE } from "./constants";
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
    const target = segmentationSize(size, maxSide);
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
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
}

/**
 * The subject alone, at the original resolution, with the model's alpha applied.
 *
 * `destination-in` keeps the destination's colour and multiplies its alpha by the
 * source's, which is precisely "cut this shape out of that picture" — and it does
 * it in one composited draw rather than by walking several million pixels in
 * JavaScript. The mask is scaled up here, by the same bilinear filter the browser
 * uses for every other `drawImage`.
 */
export function applyMask(
    source: CanvasImageSource,
    mask: CanvasImageSource,
    size: PixelSize,
): HTMLCanvasElement | null {
    const canvas = createCanvas(size);
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        return null;
    }

    ctx.drawImage(source, 0, 0, size.width, size.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, size.width, size.height);
    ctx.globalCompositeOperation = "source-over";

    return canvas;
}

export type ComposeInput = {
    /** The full-resolution original, for the subject and for the blur. */
    readonly source: CanvasImageSource;
    readonly size: PixelSize;
    /** The subject with its alpha already applied — see `applyMask`. */
    readonly cutout: CanvasImageSource;
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
 * Resolves `null` on any browser refusal rather than throwing, so the island has
 * one failure to map instead of a `try` around every step.
 */
export async function composeResult(input: ComposeInput): Promise<Blob | null> {
    const { source, size, cutout, background, backgroundImage, format } = input;
    const canvas = createCanvas(size);
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        return null;
    }

    // Trap 3. Painted before the background rather than instead of it, so a
    // partially transparent background — a PNG somebody dropped in — lands on
    // white too rather than on black.
    if (!keepsAlpha(format)) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size.width, size.height);
    }

    paintBackground(ctx, { source, size, background, backgroundImage });

    ctx.drawImage(cutout, 0, 0, size.width, size.height);

    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob),
            COMPOSITE_MIME_TYPES[format],
            // Ignored by the PNG encoder, which is lossless, and read by the
            // other two.
            COMPOSITE_QUALITY,
        );
    });
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
            const radius = blurRadiusPx(size, background.strength);
            const rect = blurredBackgroundRect(size, size, radius);

            // Trap 2. Set, drawn through, and cleared in the same three lines, so
            // there is no path where a later draw inherits it.
            ctx.filter = `blur(${radius}px)`;
            ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
            ctx.filter = "none";

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
