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
import { MAX_PIXELS, MAX_TRACE_EDGE } from "./constants";
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
import { isSvgSource, rasterizeSvg, readSvgSize, SVG_MIME_TYPE } from "./svg-source";
import { resolveBackground, resolveIconSizes, svgRenderEdge, targetFormat } from "./targets";
import { tracePixelsToSvg } from "./vectorize";
import type { ConversionOptions, ConversionOutcome, ConvertedFile, IconSize } from "../types";

const ICO_MIME_TYPE = "image/vnd.microsoft.icon";
const MANIFEST_MIME_TYPE = "application/manifest+json";
const HTML_MIME_TYPE = "text/html";

/**
 * Converts one file end to end.
 *
 * Four shapes come out of here and they share a decode: a raster target writes
 * one file, `svg` writes one file of outlines rather than pixels, `ico` writes
 * one file built from several encodes, and `favicon` writes a whole set. What
 * they have in common is that the source is decoded once and every output is
 * scaled from those pixels rather than from each other — chaining a 512 down to
 * a 16 through four intermediate sizes is how an icon ends up mush.
 *
 * A source may arrive as markup instead of a grid. An SVG has no pixels until
 * somebody picks a size, so `svgRenderEdge` picks the one the chosen target is
 * about to ask for and the browser draws the vector at exactly that size —
 * which is why a 24-pixel icon file still makes a sharp 512 favicon.
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
    const vectorSource = isSvgSource(file);

    // An SVG asked for as an SVG is already the answer. Rasterising it to trace
    // it back into outlines would replace exact curves with a polygon
    // approximation of a rendering of them, which is a worse file that took
    // longer to make.
    if (vectorSource && options.target === "svg") {
        return copyVectorSource(file);
    }

    // The pixel ceiling is applied to a vector by scaling it rather than by
    // refusing it: `width="40000"` is a number in a text file, not memory
    // somebody already spent, so the largest grid this tab holds is a better
    // answer than turning the drawing away.
    const decoded = vectorSource
        ? await rasterizeSvg(file, svgRenderEdge(options), MAX_PIXELS, createCanvas)
        : await decodeToPixels(file, createCanvas);

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

        if (options.target === "svg") {
            return await convertToVector(file, decoded, options, matte);
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
            copied: false,
            colors: 0,
        },
    };
}

/**
 * Traces one picture into outlines.
 *
 * The grid is capped at `MAX_TRACE_EDGE` before anything is traced, and that is
 * not the size control doing its job — the size control is disabled for this
 * target. Tracing costs work per region, and a larger grid finds the same
 * shapes plus every speck of noise around them; the output scales to any size
 * either way, because it is a vector.
 */
async function convertToVector(
    file: File,
    decoded: ImageData,
    options: ConversionOptions,
    matte: MatteColor | null,
): Promise<ConversionOutcome> {
    const grid = fitWithinEdge(decoded, MAX_TRACE_EDGE);
    const resized = grid.width !== decoded.width || grid.height !== decoded.height;
    const scaled = resized ? await resizePixels(decoded, grid) : decoded;
    const pixels = matte === null ? scaled : flatten(scaled, matte);

    const traced = tracePixelsToSvg(pixels, {
        colors: options.colors,
        quality: options.quality,
    });

    const blob = new Blob([traced.markup], { type: SVG_MIME_TYPE });
    const output: ConvertedFile = {
        name: buildConvertedFilename(file.name, options.target),
        bytes: blob.size,
        blob,
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
            copied: false,
            colors: traced.colors,
        },
    };
}

/**
 * Hands an SVG back as it arrived.
 *
 * The bytes are passed through rather than re-serialised from text, so a file
 * that is not UTF-8, or that carries a comment or a licence header, comes out
 * the file it went in as. The row says it was copied — silence would read as a
 * conversion that did nothing.
 */
async function copyVectorSource(file: File): Promise<ConversionOutcome> {
    const bytes = await file.arrayBuffer();
    const size = readSvgSize(new TextDecoder().decode(bytes));

    if (size === null) {
        return { ok: false, reason: "undecodable" };
    }

    const blob = new Blob([bytes], { type: SVG_MIME_TYPE });

    return {
        ok: true,
        image: {
            target: "svg",
            files: [{ name: buildConvertedFilename(file.name, "svg"), bytes: blob.size, blob }],
            totalBytes: blob.size,
            width: size.width,
            height: size.height,
            iconSizes: [],
            flattened: false,
            resized: false,
            upscaled: false,
            copied: true,
            colors: 0,
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
            copied: false,
            colors: 0,
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
            copied: false,
            colors: 0,
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
