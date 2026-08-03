import { toFilenameStem } from "@/modules/tools/domain/filenames";
import {
    browserCanvasFactory,
    decodeToPixels,
    encodePixels,
    RASTER_FORMAT_MIME_TYPES,
    resizePixels,
    type CanvasFactory,
} from "@/modules/tools/domain/image-codec";
import { fitWithinEdge, flattenOntoMatte, isOpaque } from "@/modules/tools/domain/pixels";
import type { MatteColor, PixelSize } from "@/modules/tools/types";
import { MAX_PIXELS } from "./constants";
import {
    buildFaviconHeadHtml,
    buildWebManifest,
    FAVICON_ICO_NAME,
    FAVICON_MANIFEST_NAME,
    FAVICON_PNGS,
    FAVICON_SNIPPET_NAME,
} from "./favicon";
import { buildConvertedFilename } from "./filenames";
import { buildIcoFile, type IcoImage } from "./ico";
import { iconLayout, isUpscale, padToSquare } from "./icon-layout";
import { resolveBackground, resolveIconSizes, targetFormat } from "./targets";
import type { ConversionOptions, ConversionOutcome, ConvertedFile, IconSize } from "../types";

const ICO_MIME_TYPE = "image/vnd.microsoft.icon";
const MANIFEST_MIME_TYPE = "application/manifest+json";
const HTML_MIME_TYPE = "text/html";

/**
 * Converts one file end to end.
 *
 * Three shapes come out of here and they share a decode: a raster target writes
 * one file, `ico` writes one file built from several encodes, and `favicon`
 * writes a whole set. What they have in common is that the source is decoded
 * once and every output is scaled from those pixels rather than from each
 * other — chaining a 512 down to a 16 through four intermediate sizes is how an
 * icon ends up mush.
 *
 * A pack is returned as its members rather than as a ZIP, so the batch archive
 * can nest them in a folder instead of burying a ZIP inside a ZIP. The row's
 * own download button is what packs a single reader's copy.
 */
export async function convertImage(
    file: File,
    options: ConversionOptions,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<ConversionOutcome> {
    const decoded = await decodeToPixels(file, createCanvas);

    if (decoded === null) {
        return { ok: false, reason: "undecodable" };
    }

    if (decoded.width * decoded.height > MAX_PIXELS) {
        return { ok: false, reason: "too_many_pixels" };
    }

    // Flattening happens only when there is transparency to lose and a colour
    // to lose it onto. `resolveBackground` is what forces a matte under JPEG.
    const matte = isOpaque(decoded) ? null : resolveBackground(options.target, options.background);

    try {
        const format = targetFormat(options.target);

        if (format !== null) {
            return await convertToRaster(file, decoded, options, matte);
        }

        return options.target === "favicon"
            ? await convertToFaviconPack(file, decoded, options, matte)
            : await convertToIco(file, decoded, options, matte);
    } catch {
        // A codec refusing one picture is this file's failure and nobody
        // else's; the queue behind it keeps going.
        return { ok: false, reason: "encode_failed" };
    }
}

async function convertToRaster(
    file: File,
    decoded: ImageData,
    options: ConversionOptions,
    matte: MatteColor | null,
): Promise<ConversionOutcome> {
    const format = targetFormat(options.target);

    if (format === null) {
        return { ok: false, reason: "encode_failed" };
    }

    const target = fitWithinEdge(decoded, options.maxEdge);
    const resized = target.width !== decoded.width || target.height !== decoded.height;
    const scaled = resized ? await resizePixels(decoded, target) : decoded;
    const pixels = matte === null ? scaled : flatten(scaled, matte);

    const encoded = await encodePixels(pixels, format, options.quality);

    if (encoded.byteLength === 0) {
        return { ok: false, reason: "encode_failed" };
    }

    const output: ConvertedFile = {
        name: buildConvertedFilename(file.name, options.target),
        bytes: encoded.byteLength,
        blob: new Blob([encoded], { type: RASTER_FORMAT_MIME_TYPES[format] }),
    };

    return {
        ok: true,
        image: {
            target: options.target,
            files: [output],
            totalBytes: output.bytes,
            width: pixels.width,
            height: pixels.height,
            iconSizes: [],
            flattened: matte !== null,
            resized,
            upscaled: false,
        },
    };
}

async function convertToIco(
    file: File,
    decoded: ImageData,
    options: ConversionOptions,
    matte: MatteColor | null,
): Promise<ConversionOutcome> {
    const sizes = resolveIconSizes(options);
    const ico = await buildIco(decoded, sizes, matte);

    if (ico.length === 0) {
        return { ok: false, reason: "encode_failed" };
    }

    const output: ConvertedFile = {
        name: buildConvertedFilename(file.name, options.target),
        bytes: ico.length,
        blob: new Blob([ico], { type: ICO_MIME_TYPE }),
    };

    const largest = sizes.at(-1) ?? 0;

    return {
        ok: true,
        image: {
            target: options.target,
            files: [output],
            totalBytes: output.bytes,
            width: largest,
            height: largest,
            iconSizes: sizes,
            flattened: matte !== null,
            resized: false,
            upscaled: sizes.some((size) => isUpscale(decoded, size)),
        },
    };
}

async function convertToFaviconPack(
    file: File,
    decoded: ImageData,
    options: ConversionOptions,
    matte: MatteColor | null,
): Promise<ConversionOutcome> {
    const icoSizes = resolveIconSizes(options);
    const ico = await buildIco(decoded, icoSizes, matte);

    if (ico.length === 0) {
        return { ok: false, reason: "encode_failed" };
    }

    const pngs = await Promise.all(
        FAVICON_PNGS.map(async (spec) => ({
            name: spec.name,
            blob: new Blob([await encodeSquarePng(decoded, spec.size, matte)], {
                type: RASTER_FORMAT_MIME_TYPES.png,
            }),
        })),
    );

    const stem = toFilenameStem(file.name);

    const files: ConvertedFile[] = [
        { name: FAVICON_ICO_NAME, blob: new Blob([ico], { type: ICO_MIME_TYPE }) },
        ...pngs,
        {
            name: FAVICON_MANIFEST_NAME,
            blob: new Blob([buildWebManifest(stem)], { type: MANIFEST_MIME_TYPE }),
        },
        {
            name: FAVICON_SNIPPET_NAME,
            blob: new Blob([buildFaviconHeadHtml()], { type: HTML_MIME_TYPE }),
        },
    ].map((entry) => ({ ...entry, bytes: entry.blob.size }));

    const sizes = [...icoSizes, ...FAVICON_PNGS.map((png) => png.size)];
    const largest = Math.max(...sizes);

    return {
        ok: true,
        image: {
            target: options.target,
            files,
            totalBytes: files.reduce((total, entry) => total + entry.bytes, 0),
            width: largest,
            height: largest,
            iconSizes: icoSizes,
            flattened: matte !== null,
            resized: false,
            upscaled: sizes.some((size) => isUpscale(decoded, size)),
        },
    };
}

async function buildIco(
    decoded: ImageData,
    sizes: readonly IconSize[],
    matte: MatteColor | null,
): Promise<Uint8Array<ArrayBuffer>> {
    const images: IcoImage[] = [];

    for (const size of sizes) {
        images.push({ size, png: new Uint8Array(await encodeSquarePng(decoded, size, matte)) });
    }

    return images.length === 0 ? new Uint8Array() : buildIcoFile(images);
}

/** One square PNG at one size, scaled and padded from the source pixels. */
async function encodeSquarePng(
    decoded: ImageData,
    size: number,
    matte: MatteColor | null,
): Promise<ArrayBuffer> {
    const layout = iconLayout(decoded, size);
    const scaled = await resizeIfNeeded(decoded, layout);
    const flat = matte === null ? scaled : flatten(scaled, matte);
    const square = padToSquare(
        { data: flat.data, width: flat.width, height: flat.height },
        layout,
        matte,
    );

    // Quality is ignored by OxiPNG; PNG is always written losslessly here.
    return encodePixels(new ImageData(square, layout.size, layout.size), "png", 100);
}

function flatten(pixels: ImageData, matte: MatteColor): ImageData {
    return new ImageData(flattenOntoMatte(pixels, matte), pixels.width, pixels.height);
}

function resizeIfNeeded(decoded: ImageData, size: PixelSize): Promise<ImageData> | ImageData {
    return size.width === decoded.width && size.height === decoded.height
        ? decoded
        : resizePixels(decoded, size);
}
