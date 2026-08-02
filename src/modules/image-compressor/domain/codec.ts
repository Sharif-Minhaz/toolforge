import { loadImageElement } from "@/modules/tools/domain/image-element";
import {
    AVIF_ENCODE_OPTIONS,
    JPEG_ENCODE_OPTIONS,
    MAX_PIXELS,
    PNG_OPTIMISE_OPTIONS,
    RESIZE_OPTIONS,
    WEBP_ENCODE_OPTIONS,
} from "./constants";
import { FORMAT_MIME_TYPES } from "./filenames";
import { candidateFormats, resolveTargetSize } from "./options";
import { flattenOntoMatte, isOpaque } from "./pixels";
import type {
    CompressedImage,
    CompressionOptions,
    CompressionOutcome,
    EncodedFormat,
} from "../types";

/**
 * The browser glue this tool cannot do without, kept in one file so the
 * arithmetic around it stays pure and testable. Injectable for the same reason
 * `clipboard.ts` and `file-saver.ts` are.
 */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const browserCanvasFactory: CanvasFactory = (width, height) => {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
};

/**
 * Decodes a picked file to raw pixels.
 *
 * `createImageBitmap` with `imageOrientation: "from-image"` is what applies the
 * EXIF rotation a phone writes instead of rotating the pixels — without it, a
 * portrait photograph re-encodes sideways, because the tag is dropped along
 * with the rest of the metadata. The `<img>` fallback covers the browsers that
 * lack the option; they apply the orientation themselves when decoding into an
 * element, so both paths agree.
 */
export async function decodeToPixels(
    blob: Blob,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<ImageData | null> {
    const source = await decodeToDrawable(blob);

    if (source === null) {
        return null;
    }

    try {
        const width = "naturalWidth" in source ? source.naturalWidth : source.width;
        const height = "naturalHeight" in source ? source.naturalHeight : source.height;

        if (width <= 0 || height <= 0) {
            return null;
        }

        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");

        if (context === null) {
            return null;
        }

        context.drawImage(source, 0, 0);

        return context.getImageData(0, 0, width, height);
    } finally {
        if ("close" in source) {
            source.close();
        }
    }
}

async function decodeToDrawable(blob: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
    if (typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(blob, { imageOrientation: "from-image" });
        } catch {
            // Falls through to the element path rather than failing the file:
            // some browsers reject the option instead of ignoring it.
        }
    }

    const url = URL.createObjectURL(blob);

    try {
        return await loadImageElement(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Lanczos3 in linear light — the reason not to hand a downscale to `drawImage`. */
async function resizePixels(pixels: ImageData, width: number, height: number): Promise<ImageData> {
    const { default: resize } = await import("@jsquash/resize");

    return resize(pixels, { ...RESIZE_OPTIONS, width, height });
}

/**
 * Runs one encoder over one set of pixels.
 *
 * Each codec is imported on demand, so a reader who only ever writes WebP never
 * downloads libaom. PNG goes through OxiPNG's raw entry point, which builds the
 * file and optimises it in one pass — there is no separate PNG encoder here
 * because there is no reason to write a file only to rewrite it.
 */
export async function encodePixels(
    pixels: ImageData,
    format: EncodedFormat,
    quality: number,
): Promise<ArrayBuffer> {
    switch (format) {
        case "jpeg": {
            const { default: encode } = await import("@jsquash/jpeg/encode");

            return encode(pixels, { ...JPEG_ENCODE_OPTIONS, quality });
        }
        case "webp": {
            const { default: encode } = await import("@jsquash/webp/encode");

            return encode(pixels, { ...WEBP_ENCODE_OPTIONS, quality });
        }
        case "avif": {
            const { default: encode } = await import("@jsquash/avif/encode");

            return encode(pixels, { ...AVIF_ENCODE_OPTIONS, quality });
        }
        case "png": {
            const { default: optimise } = await import("@jsquash/oxipng/optimise");

            return optimise(pixels, PNG_OPTIMISE_OPTIONS);
        }
    }
}

/**
 * Compresses one file end to end.
 *
 * Under `smallest` every candidate is encoded and the shortest result wins, so
 * the reader gets the best of four codecs rather than the best guess about
 * which one suits their picture. The comparison is on bytes at one quality
 * setting, which is the only comparison that can be made without asking a
 * person to look at the two.
 */
export async function compressImage(
    file: File,
    options: CompressionOptions,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<CompressionOutcome> {
    const decoded = await decodeToPixels(file, createCanvas);

    if (decoded === null) {
        return { ok: false, reason: "undecodable" };
    }

    if (decoded.width * decoded.height > MAX_PIXELS) {
        return { ok: false, reason: "too_many_pixels" };
    }

    const target = resolveTargetSize(decoded, options.maxEdge);
    const resized = target.width !== decoded.width || target.height !== decoded.height;
    const pixels = resized ? await resizePixels(decoded, target.width, target.height) : decoded;

    const opaque = isOpaque(pixels);
    const candidates = candidateFormats(options.format, file.type, opaque);

    let best: CompressedImage | null = null;

    for (const format of candidates) {
        const flattened = format === "jpeg" && !opaque;
        const input = flattened
            ? new ImageData(flattenOntoMatte(pixels), pixels.width, pixels.height)
            : pixels;

        let encoded: ArrayBuffer;

        try {
            encoded = await encodePixels(input, format, options.quality);
        } catch {
            // One codec failing is not the whole file failing: under `smallest`
            // the others may still produce a result, and only an empty shortlist
            // is a real failure.
            continue;
        }

        if (encoded.byteLength === 0) {
            continue;
        }

        if (best !== null && encoded.byteLength >= best.bytes) {
            continue;
        }

        best = {
            format,
            bytes: encoded.byteLength,
            width: pixels.width,
            height: pixels.height,
            blob: new Blob([encoded], { type: FORMAT_MIME_TYPES[format] }),
            flattened,
            resized,
        };
    }

    return best === null ? { ok: false, reason: "encode_failed" } : { ok: true, image: best };
}
