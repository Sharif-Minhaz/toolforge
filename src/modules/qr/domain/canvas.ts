import { loadImageElement } from "@/modules/tools/domain/image-element";

/**
 * The browser glue the two raster paths need: turning the rendered SVG into a
 * PNG for download, and turning an uploaded image into the pixels a decoder
 * reads. The arithmetic around both lives in pure modules; what is left here is
 * the handful of calls that only a browser can make.
 */

/** Injected so a caller can hand over an off-screen canvas of its own. */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const browserCanvasFactory: CanvasFactory = (width, height) => {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
};

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
}

/**
 * Rasterises the code at whatever size was asked for.
 *
 * The SVG goes through an object URL rather than a `data:` URL because Safari
 * refuses to load a `data:image/svg+xml` into an `<img>` that is later drawn to
 * a canvas. The logo inside is already a `data:` URL, so nothing here reaches
 * the network and the canvas never becomes tainted — which is what keeps
 * `toBlob` working.
 */
export async function renderSvgToPng(
    svg: string,
    pixelSize: number,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<Blob | null> {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

    try {
        const image = await loadImageElement(url);

        if (image === null) {
            return null;
        }

        const canvas = createCanvas(pixelSize, pixelSize);
        const context = canvas.getContext("2d");

        if (context === null) {
            return null;
        }

        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, pixelSize, pixelSize);

        return await toPngBlob(canvas);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Longest side a scanned frame is reduced to before the decoder walks it. */
const MAX_DECODE_SIDE = 1_400;

export type DecodableFrame = {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
};

/**
 * Pixels from anything the browser can draw, scaled so the decoder has a
 * bounded amount of work. A 48-megapixel phone photograph is four seconds of
 * scanning at full size and no more accurate for it — the modules are far
 * larger than one pixel either way.
 */
export function readFramePixels(
    source: CanvasImageSource,
    width: number,
    height: number,
    createCanvas: CanvasFactory = browserCanvasFactory,
): DecodableFrame | null {
    if (width <= 0 || height <= 0) {
        return null;
    }

    const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = createCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (context === null) {
        return null;
    }

    context.drawImage(source, 0, 0, targetWidth, targetHeight);

    try {
        const pixels = context.getImageData(0, 0, targetWidth, targetHeight);

        return { data: pixels.data, width: pixels.width, height: pixels.height };
    } catch {
        // A tainted canvas, which only a cross-origin source can cause.
        return null;
    }
}
