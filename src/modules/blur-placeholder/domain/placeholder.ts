import { bytesToDataUri } from "@/modules/tools/domain/base64";
import {
    browserCanvasFactory,
    decodeToPixels,
    encodePixels,
    RASTER_FORMAT_MIME_TYPES,
    resizePixels,
    type CanvasFactory,
} from "@/modules/tools/domain/image-codec";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { fitWithinEdge } from "@/modules/tools/domain/pixels";
import type { PixelSize } from "@/modules/tools/types";
import { placeholderSize } from "./aspect";
import { decodeBlurhash, encodeBlurhash, parseBlurhash } from "./blurhash";
import { ENCODE_EDGE, IMAGE_FILE_LIMITS, MAX_PIXELS } from "./constants";
import type {
    BlurPlaceholderOptions,
    PlaceholderResult,
    PlaceholderSource,
    ReadSourceResult,
} from "../types";

/**
 * The two impure ends of the tool: reading a picked file, and writing the PNG
 * that goes inside `blurDataURL`. Everything between them is `blurhash.ts` and
 * is pure.
 *
 * The PNG is written by OxiPNG rather than `canvas.toDataURL`, and here that is
 * not about fidelity — a 32-pixel blur has none to lose. It is about length: a
 * data URI is inlined into the HTML of every page that uses it, so the few
 * hundred bytes OxiPNG saves are paid for on every request rather than once.
 */

async function paint(
    hash: string,
    shape: PixelSize,
    options: BlurPlaceholderOptions,
): Promise<PlaceholderResult> {
    const parsed = parseBlurhash(hash);

    if (!parsed.ok) {
        return parsed;
    }

    const size = placeholderSize(shape, options.edge);
    const decoded = decodeBlurhash(hash, size.width, size.height, options.punch);

    if (!decoded.ok) {
        // `placeholderSize` floors both edges at one pixel, so the size branch
        // is unreachable; it is mapped rather than widening the reader-facing
        // vocabulary with a failure nobody can produce.
        return decoded.reason === "invalid_size" ? { ok: false, reason: "encode_failed" } : decoded;
    }

    try {
        const png = await encodePixels(
            new ImageData(decoded.pixels, size.width, size.height),
            "png",
            100,
        );

        if (png.byteLength === 0) {
            return { ok: false, reason: "encode_failed" };
        }

        const dataUri = bytesToDataUri(new Uint8Array(png), RASTER_FORMAT_MIME_TYPES.png);

        return {
            ok: true,
            placeholder: {
                hash,
                componentX: parsed.componentX,
                componentY: parsed.componentY,
                dataUri,
                dataUriBytes: dataUri.length,
                width: size.width,
                height: size.height,
            },
        };
    } catch {
        return { ok: false, reason: "encode_failed" };
    }
}

/**
 * Decodes a picked file once and keeps it, so nudging a detail stepper costs a
 * transform rather than a decode. The kept copy is downscaled to `ENCODE_EDGE`
 * — see the note on that constant for why that is free.
 */
export async function readSource(
    file: File,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<ReadSourceResult> {
    const checked = checkImageFile(file, IMAGE_FILE_LIMITS);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const decoded = await decodeToPixels(file, createCanvas);

    if (decoded === null) {
        return { ok: false, reason: "undecodable" };
    }

    if (decoded.width * decoded.height > MAX_PIXELS) {
        return { ok: false, reason: "too_many_pixels" };
    }

    try {
        const working = fitWithinEdge(decoded, ENCODE_EDGE);
        const scaled =
            working.width === decoded.width && working.height === decoded.height
                ? decoded
                : await resizePixels(decoded, working);

        return {
            ok: true,
            source: {
                name: file.name,
                pixels: { data: scaled.data, width: scaled.width, height: scaled.height },
                sourceWidth: decoded.width,
                sourceHeight: decoded.height,
            },
        };
    } catch {
        return { ok: false, reason: "encode_failed" };
    }
}

/** Picture → hash → PNG. The placeholder keeps the picture's own shape. */
export function buildFromSource(
    source: PlaceholderSource,
    options: BlurPlaceholderOptions,
): Promise<PlaceholderResult> {
    const encoded = encodeBlurhash(source.pixels, options.componentX, options.componentY);

    if (!encoded.ok) {
        return Promise.resolve({ ok: false, reason: "encode_failed" });
    }

    return paint(encoded.hash, { width: source.sourceWidth, height: source.sourceHeight }, options);
}

/** Hash → PNG. The shape comes from the ratio picker, because the hash has none. */
export function buildFromHash(
    hash: string,
    shape: PixelSize,
    options: BlurPlaceholderOptions,
): Promise<PlaceholderResult> {
    return paint(hash.trim(), shape, options);
}
