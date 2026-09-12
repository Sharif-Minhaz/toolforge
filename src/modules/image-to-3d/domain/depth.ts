import { resizePixels } from "@/modules/tools/domain/image-codec";
import type { PixelSize } from "@/modules/tools/types";
import type { SegmentationProgress } from "@/modules/tools/types/segmentation";

/**
 * Monocular depth, in the browser.
 *
 * Brightness is not depth: a dark object in bright light and a bright object in
 * shade come out the wrong way round, and a shadow becomes a valley. A depth
 * estimator reads the picture as a scene — a snout is nearer than the ears, a
 * chest nearer than the shoulders — and that is the relief a body should carry
 * on its surface. Depth Anything V2 (small) does it from one picture, and its
 * ONNX export runs here on ONNX Runtime Web, which this repository already
 * carries for the Background Remover.
 *
 * It is still not reconstruction. What comes back is *relative* depth over the
 * front of the subject, which is exactly the information a heightfield can use
 * and exactly none of what the back of the subject would need.
 *
 * The pure half — sizing, packing, normalising — is below and tested. The
 * runtime half is at the bottom, behind a lazy import, and is the one part
 * `bun test` cannot reach: it needs WebAssembly the runtime fetches for itself.
 */

/**
 * The 4-bit export, and not the 8-bit one of the same size.
 *
 * Verified on the installed runtime rather than assumed: the int8 export
 * quantises its convolutions to `ConvInteger`, which this runtime's WebAssembly
 * build has no kernel for, and the session refuses to open. The q4 export
 * keeps the convolutions in full precision and packs only the matrix
 * multiplies, with `MatMulNBits`, which both the WebAssembly and WebGPU
 * backends run. Same download, and it loads.
 */
export const DEPTH_MODEL_URL =
    "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_q4.onnx";

/** Read from the file itself, for the line that tells the reader what a first run costs. */
export const DEPTH_MODEL_BYTES = 27_404_416;

/**
 * Pinned to the installed package, and a test checks that it is.
 *
 * The runtime's WebAssembly is fetched from a CDN rather than served from
 * `public/`, because it is 24 MB of binaries that belong to a dependency rather
 * than to this repository. The version in the URL has to be the one whose
 * JavaScript glue is bundled here, or the two disagree about their ABI.
 */
export const DEPTH_RUNTIME_VERSION = "1.21.0";

export const DEPTH_RUNTIME_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${DEPTH_RUNTIME_VERSION}/dist/`;

/** The WebGPU-capable build, which is the larger of the two the runtime may pick. */
export const DEPTH_RUNTIME_BYTES = 23_914_392;

/** What a first run costs to download, model plus runtime. */
export const DEPTH_FIRST_RUN_BYTES = DEPTH_MODEL_BYTES + DEPTH_RUNTIME_BYTES;

/** The Cache API bucket the model is kept in. */
export const DEPTH_CACHE_NAME = "toolforge-depth-model";

/** The model's own numbers, from its `preprocessor_config.json`. */
export const DEPTH_INPUT_EDGE = 518;
export const DEPTH_PATCH = 14;
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/** How much of a thrown message is kept for the log. */
const MAX_ERROR_DETAIL_LENGTH = 300;

export type DepthMap = {
    readonly width: number;
    readonly height: number;
    /** `width * height` values in 0..1, row-major, 1 at the nearest point. */
    readonly values: Float32Array;
};

/**
 * Two states rather than one — `CLAUDE.md` rule 28. "The model did not
 * download" is answered by trying again on a better connection; "the runtime
 * refused it" is not.
 */
export type DepthFailureReason = "depth_unavailable" | "depth_failed";

export type DepthResult =
    | { readonly ok: true; readonly depth: DepthMap }
    | { readonly ok: false; readonly reason: DepthFailureReason; readonly detail: string };

/**
 * The size the picture is handed to the model at.
 *
 * Longest edge at 518 and both edges a multiple of the ViT patch, which is what
 * `keep_aspect_ratio` plus `ensure_multiple_of` in the model's own preprocessor
 * means. Never smaller than one patch on either axis: a 4000×1 banner is a
 * legal picture and a zero-height tensor is not.
 */
export function depthInputSize(size: PixelSize): PixelSize {
    const longest = Math.max(size.width, size.height, 1);
    const scale = DEPTH_INPUT_EDGE / longest;
    const toPatch = (value: number) =>
        Math.max(DEPTH_PATCH, Math.round((value * scale) / DEPTH_PATCH) * DEPTH_PATCH);

    return { width: toPatch(size.width), height: toPatch(size.height) };
}

/**
 * RGBA bytes to the planar, normalised float tensor the model reads.
 *
 * NCHW — all of red, then all of green, then all of blue — with each channel
 * rescaled to 0..1 and standardised by ImageNet's mean and deviation, which is
 * the convention every DPT-family model was trained under. Alpha is dropped:
 * the model has never seen a fourth channel, and a cut-out's transparent
 * background is whatever colour the encoder left there, so the depth is read
 * from the *original* picture and masked afterwards.
 */
export function packDepthInput(pixels: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}): Float32Array {
    const count = pixels.width * pixels.height;
    const tensor = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            tensor[channel * count + index] =
                (pixels.data[index * 4 + channel] / 255 - IMAGENET_MEAN[channel]) /
                IMAGENET_STD[channel];
        }
    }

    return tensor;
}

/**
 * The model's output — relative inverse depth, larger nearer, on an arbitrary
 * scale — pinned to 0..1 with the nearest point at 1.
 *
 * Min-max rather than a fixed scale, because the output has none: the same
 * snout is 3.1 in one picture and 11.4 in the next. A flat output (every value
 * equal, which a blank picture produces) becomes zeros rather than a division
 * by nothing.
 */
export function normalizeDepth(raw: ArrayLike<number>, size: PixelSize): DepthMap {
    const values = new Float32Array(size.width * size.height);
    let lowest = Infinity;
    let highest = -Infinity;

    for (let index = 0; index < values.length; index += 1) {
        const value = Number(raw[index]);

        lowest = Math.min(lowest, value);
        highest = Math.max(highest, value);
    }

    const span = highest - lowest;

    if (span > 0 && Number.isFinite(span)) {
        for (let index = 0; index < values.length; index += 1) {
            values[index] = (Number(raw[index]) - lowest) / span;
        }
    }

    return { width: size.width, height: size.height, values };
}

/**
 * Whether a thrown error came from the model never arriving, or from the
 * runtime running and failing.
 */
export function classifyDepthError(message: string): DepthFailureReason {
    const text = message.toLowerCase();

    if (
        text.includes("failed to fetch") ||
        text.includes("networkerror") ||
        text.includes("load failed") ||
        text.includes("could not download")
    ) {
        return "depth_unavailable";
    }

    return "depth_failed";
}

// ---------------------------------------------------------------------------
// Everything below needs a browser.

/**
 * The model's bytes, from the Cache API when it has them and from the network
 * once when it does not.
 *
 * The browser's own HTTP cache is not enough here, unlike for the segmentation
 * weights. Hugging Face answers the canonical URL with a `no-store` redirect to
 * a signed address that is different every time, so nothing about the second
 * request matches the first. The Cache API keys on the URL *asked for*, which
 * is what makes the model a one-time download — and it is also the honest
 * answer to "is it already here", which the HTTP cache cannot be asked at all.
 */
async function fetchDepthModel(
    onProgress: (progress: SegmentationProgress) => void,
): Promise<ArrayBuffer> {
    const cache = await openCache();
    const cached = cache === null ? undefined : await cache.match(DEPTH_MODEL_URL);

    if (cached !== undefined) {
        return cached.arrayBuffer();
    }

    const response = await fetch(DEPTH_MODEL_URL);

    if (!response.ok || response.body === null) {
        throw new Error(`could not download the depth model (${response.status})`);
    }

    const total = Number(response.headers.get("content-length")) || DEPTH_MODEL_BYTES;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        received += value.byteLength;
        onProgress({ phase: "download", ratio: Math.min(1, received / total) });
    }

    const buffer = new Uint8Array(received);
    let offset = 0;

    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
    }

    if (cache !== null) {
        try {
            await cache.put(
                DEPTH_MODEL_URL,
                new Response(buffer.slice(), {
                    headers: { "content-type": "application/octet-stream" },
                }),
            );
        } catch {
            // Quota or a private window. The model still ran; it will simply be
            // fetched again next time, which is what would have happened anyway.
        }
    }

    return buffer.buffer;
}

async function openCache(): Promise<Cache | null> {
    try {
        return typeof caches === "undefined" ? null : await caches.open(DEPTH_CACHE_NAME);
    } catch {
        return null;
    }
}

type DepthSession = {
    run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
};

let sessionPromise: Promise<DepthSession> | null = null;

/**
 * One session per page. Creating it means fetching the runtime's WebAssembly
 * and parsing 27 MB of weights, and neither is worth doing twice; a failure
 * clears the promise so the next picture tries again rather than inheriting
 * the same rejection forever.
 */
function loadDepthSession(
    onProgress: (progress: SegmentationProgress) => void,
): Promise<DepthSession> {
    if (sessionPromise === null) {
        sessionPromise = (async () => {
            // Imported here rather than at the top of the file so a reader who
            // opens the page and never drops a picture in downloads none of it.
            const ort = await import("onnxruntime-web");

            ort.env.wasm.wasmPaths = DEPTH_RUNTIME_BASE;

            const model = await fetchDepthModel(onProgress);

            onProgress({ phase: "compute", ratio: 0 });

            // The GPU when the browser offers one, and the WebAssembly build
            // when it does not — the runtime walks the list itself.
            return ort.InferenceSession.create(model, {
                executionProviders: ["webgpu", "wasm"],
            }) as Promise<DepthSession>;
        })().catch((error: unknown) => {
            sessionPromise = null;

            throw error;
        });
    }

    return sessionPromise;
}

/**
 * Relative depth for one picture, at the model's own resolution.
 *
 * Resolved, never rejected: the island has one failure to map, and the model
 * still builds from brightness when depth is not to be had.
 */
export async function estimateDepth(
    pixels: ImageData,
    onProgress: (progress: SegmentationProgress) => void,
): Promise<DepthResult> {
    try {
        const size = depthInputSize(pixels);
        const resized =
            size.width === pixels.width && size.height === pixels.height
                ? pixels
                : await resizePixels(pixels, size);

        const session = await loadDepthSession(onProgress);
        const ort = await import("onnxruntime-web");

        onProgress({ phase: "compute", ratio: 0.5 });

        const output = await session.run({
            pixel_values: new ort.Tensor("float32", packDepthInput(resized), [
                1,
                3,
                size.height,
                size.width,
            ]),
        });

        const predicted = output.predicted_depth;

        if (predicted === undefined) {
            return { ok: false, reason: "depth_failed", detail: "no predicted_depth output" };
        }

        return { ok: true, depth: normalizeDepth(predicted.data, size) };
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);

        return {
            ok: false,
            reason: classifyDepthError(message),
            detail: message.slice(0, MAX_ERROR_DETAIL_LENGTH),
        };
    }
}
