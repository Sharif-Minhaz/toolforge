import { createCanvas, context2d, releaseCanvas } from "@/modules/tools/domain/canvas";
import {
    browserCanvasFactory,
    decodeToPixels,
    encodePixels,
    resizePixels,
    type CanvasFactory,
} from "@/modules/tools/domain/image-codec";
import { loadImageElement } from "@/modules/tools/domain/image-element";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { fitWithinEdge, isOpaque } from "@/modules/tools/domain/pixels";
import { computeAlphaMask, toSegmentationInput } from "@/modules/tools/domain/segmentation";
import type {
    CutoutQuality,
    SegmentationFailureReason,
    SegmentationProgress,
} from "@/modules/tools/types/segmentation";
import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "@/modules/tools/types";

import type { ModelTexture } from "../types";
import { estimateDepth, type DepthFailureReason, type DepthMap } from "./depth";
import {
    MAX_EMBEDDED_TEXTURE_BYTES,
    MAX_PIXELS,
    MAX_SOURCE_BYTES,
    TEXTURE_JPEG_QUALITY,
    WORKING_EDGE,
} from "./constants";

export const IMAGE_FILE_LIMITS = {
    allowedTypes: DECODABLE_IMAGE_TYPES,
    maxBytes: MAX_SOURCE_BYTES,
} as const satisfies { allowedTypes: readonly DecodableImageType[]; maxBytes: number };

export const IMAGE_ACCEPT_ATTRIBUTE = DECODABLE_IMAGE_TYPES.join(",");

export type SourceFailureReason =
    "empty_file" | "unsupported_type" | "too_large" | "undecodable" | "too_many_pixels";

/** One set of pixels and the picture that goes on the model built from them. */
export type SourceLayer = {
    readonly pixels: ImageData;
    /** `null` when nothing PNG or JPEG could be produced; every format still works. */
    readonly texture: ModelTexture | null;
};

export type ModelSource = {
    readonly name: string;
    /** The picture as it arrived, downscaled to `WORKING_EDGE`. */
    readonly original: SourceLayer;
    /**
     * The same picture with everything but the subject made transparent.
     *
     * `null` when no cut-out was made — either it was not asked for, or the
     * model could not be reached. Held alongside the original rather than
     * replacing it so the toggle costs nothing to flip back.
     */
    readonly cut: SourceLayer | null;
    /** True when the picture arrived with a cut-out of its own, so no model ran. */
    readonly hadAlpha: boolean;
    /** Set when a cut-out was asked for and the model could not deliver one. */
    readonly cutFailure: SegmentationFailureReason | null;
    /**
     * Relative depth over the picture, at the estimator's own resolution.
     *
     * Read from the original rather than the cut-out — the model has never
     * seen a transparent background — and `null` until asked for or when the
     * estimator could not run, in which case the heightfield reads brightness.
     */
    readonly depth: DepthMap | null;
    readonly depthFailure: DepthFailureReason | null;
    /** The picture's real size, kept for the line that reports it. */
    readonly width: number;
    readonly height: number;
};

export type ReadSourceResult =
    | { readonly ok: true; readonly source: ModelSource }
    | { readonly ok: false; readonly reason: SourceFailureReason };

/** Which model is at work, for the line that says so. */
export type SourceStage = "cutout" | "depth";

export type SourceProgress = {
    readonly stage: SourceStage;
    readonly progress: SegmentationProgress;
};

export type ReadSourceOptions = {
    /** Whether to ask the segmentation model for a subject mask. */
    readonly cutout: boolean;
    /** Whether to ask the depth estimator for a relief. */
    readonly depth: boolean;
    readonly quality: CutoutQuality;
    readonly onProgress: (progress: SourceProgress | null) => void;
};

/**
 * The picture glTF and the OBJ archive are allowed to carry.
 *
 * A PNG or a JPEG small enough to embed goes in untouched — it is the picture
 * exactly as the reader picked it, with no second generation of artefacts and
 * no encode to wait through. Everything else is re-encoded from the working
 * copy, as JPEG when the picture is opaque and PNG when it is not: a cut-out
 * flattened into JPEG comes back with a black rectangle behind it, and a
 * photograph written as PNG is several times the size for nothing.
 */
async function buildTexture(
    pixels: ImageData,
    original: File | null,
): Promise<ModelTexture | null> {
    const type = original === null ? "" : original.type.split(";")[0].trim().toLowerCase();

    if (
        original !== null &&
        (type === "image/png" || type === "image/jpeg") &&
        original.size > 0 &&
        original.size <= MAX_EMBEDDED_TEXTURE_BYTES
    ) {
        return { bytes: new Uint8Array(await original.arrayBuffer()), mimeType: type };
    }

    try {
        if (isOpaque(pixels)) {
            const encoded = await encodePixels(pixels, "jpeg", TEXTURE_JPEG_QUALITY);

            return { bytes: new Uint8Array(encoded), mimeType: "image/jpeg" };
        }

        const encoded = await encodePixels(pixels, "png", 100);

        return { bytes: new Uint8Array(encoded), mimeType: "image/png" };
    } catch {
        // A codec that would not load costs the reader a texture, not the
        // model: GLB and PLY fall back to per-vertex colour and the OBJ ships
        // without a material.
        return null;
    }
}

/** The working copy as something a canvas will draw, which the model needs. */
function toCanvas(pixels: ImageData): HTMLCanvasElement | null {
    const canvas = createCanvas({ width: pixels.width, height: pixels.height });
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        releaseCanvas(canvas);

        return null;
    }

    ctx.putImageData(pixels, 0, 0);

    return canvas;
}

/**
 * The subject alone, with the background made transparent.
 *
 * `destination-in` keeps the destination's colour and multiplies its alpha by
 * the source's, which is precisely "cut this shape out of that picture" — one
 * composited draw rather than a walk over several million pixels in JavaScript.
 * The mask arrives at the model's own resolution and is scaled back up by the
 * same bilinear filter the browser uses for every other `drawImage`, which is
 * what a smooth, low-frequency image is safe to do.
 */
function applyMask(pixels: ImageData, mask: CanvasImageSource): ImageData | null {
    const canvas = toCanvas(pixels);
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        releaseCanvas(canvas);

        return null;
    }

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, pixels.width, pixels.height);
    ctx.globalCompositeOperation = "source-over";

    const cut = ctx.getImageData(0, 0, pixels.width, pixels.height);

    releaseCanvas(canvas);

    return cut;
}

async function cutSubjectOut(
    pixels: ImageData,
    options: Pick<ReadSourceOptions, "quality" | "onProgress">,
): Promise<{ pixels: ImageData | null; failure: SegmentationFailureReason | null }> {
    const canvas = toCanvas(pixels);

    if (canvas === null) {
        return { pixels: null, failure: "removal_failed" };
    }

    try {
        const input = await toSegmentationInput(canvas, {
            width: pixels.width,
            height: pixels.height,
        });

        if (input === null) {
            return { pixels: null, failure: "removal_failed" };
        }

        const mask = await computeAlphaMask(input, options.quality, (progress) =>
            options.onProgress({ stage: "cutout", progress }),
        );

        if (!mask.ok) {
            return { pixels: null, failure: mask.reason };
        }

        const url = URL.createObjectURL(mask.mask);

        try {
            const image = await loadImageElement(url);

            if (image === null) {
                return { pixels: null, failure: "removal_failed" };
            }

            return { pixels: applyMask(pixels, image), failure: null };
        } finally {
            URL.revokeObjectURL(url);
        }
    } finally {
        releaseCanvas(canvas);
    }
}

/**
 * The source with a cut-out added, when one would change something.
 *
 * A picture that already carries an alpha channel is its own silhouette, and
 * running a hundred-megabyte model to rediscover an outline the file states
 * outright is a download charged to the reader for nothing.
 */
export async function withCutout(
    source: ModelSource,
    options: Pick<ReadSourceOptions, "quality" | "onProgress">,
): Promise<ModelSource> {
    if (source.hadAlpha || source.cut !== null) {
        return source;
    }

    const { pixels, failure } = await cutSubjectOut(source.original.pixels, options);

    options.onProgress(null);

    if (pixels === null) {
        return { ...source, cutFailure: failure };
    }

    return {
        ...source,
        cut: { pixels, texture: await buildTexture(pixels, null) },
        cutFailure: null,
    };
}

/** The source with a depth estimate added, read from the original picture. */
export async function withDepth(
    source: ModelSource,
    options: Pick<ReadSourceOptions, "onProgress">,
): Promise<ModelSource> {
    if (source.depth !== null) {
        return source;
    }

    const result = await estimateDepth(source.original.pixels, (progress) =>
        options.onProgress({ stage: "depth", progress }),
    );

    options.onProgress(null);

    if (!result.ok) {
        return { ...source, depthFailure: result.reason };
    }

    return { ...source, depth: result.depth, depthFailure: null };
}

/**
 * Decodes a picked file once and keeps the working copy, so nudging a stepper
 * costs a resample rather than a decode. The two models run after it, each
 * only when asked for.
 */
export async function readModelSource(
    file: File,
    options: ReadSourceOptions,
    createCanvasFactory: CanvasFactory = browserCanvasFactory,
): Promise<ReadSourceResult> {
    const checked = checkImageFile(file, IMAGE_FILE_LIMITS);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const decoded = await decodeToPixels(file, createCanvasFactory);

    if (decoded === null) {
        return { ok: false, reason: "undecodable" };
    }

    if (decoded.width * decoded.height > MAX_PIXELS) {
        return { ok: false, reason: "too_many_pixels" };
    }

    const working = fitWithinEdge(decoded, WORKING_EDGE);
    const pixels =
        working.width === decoded.width && working.height === decoded.height
            ? decoded
            : await resizePixels(decoded, working);

    let source: ModelSource = {
        name: file.name,
        original: {
            pixels,
            // The reader's own file is embedded whole only when the working
            // copy is still the whole picture; a downscaled copy has to be
            // re-encoded or the texture would not match the mesh's proportions.
            texture: await buildTexture(pixels, pixels === decoded ? file : null),
        },
        cut: null,
        hadAlpha: !isOpaque(pixels),
        cutFailure: null,
        depth: null,
        depthFailure: null,
        width: decoded.width,
        height: decoded.height,
    };

    if (options.cutout) {
        source = await withCutout(source, options);
    }

    if (options.depth) {
        source = await withDepth(source, options);
    }

    return { ok: true, source };
}
