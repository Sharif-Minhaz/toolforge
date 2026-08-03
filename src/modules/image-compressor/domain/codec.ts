import {
    browserCanvasFactory,
    decodeToPixels,
    encodePixels,
    RASTER_FORMAT_MIME_TYPES,
    resizePixels,
    type CanvasFactory,
} from "@/modules/tools/domain/image-codec";
import { fitWithinEdge, flattenOntoMatte, isOpaque } from "@/modules/tools/domain/pixels";
import { MAX_PIXELS } from "./constants";
import { candidateFormats } from "./options";
import type { CompressedImage, CompressionOptions, CompressionOutcome } from "../types";

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

    const target = fitWithinEdge(decoded, options.maxEdge);
    const resized = target.width !== decoded.width || target.height !== decoded.height;
    const pixels = resized ? await resizePixels(decoded, target) : decoded;

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
            blob: new Blob([encoded], { type: RASTER_FORMAT_MIME_TYPES[format] }),
            flattened,
            resized,
        };
    }

    return best === null ? { ok: false, reason: "encode_failed" } : { ok: true, image: best };
}
