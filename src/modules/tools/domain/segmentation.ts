import type {
    CutoutQuality,
    SegmentationFailureReason,
    SegmentationPhase,
    SegmentationProgress,
} from "../types/segmentation";
import type { PixelSize } from "../types";
import { createCanvas, context2d, releaseCanvas } from "./canvas";
import { fitWithinEdge } from "./pixels";

/**
 * Driving the subject-segmentation model.
 *
 * Shared by the Background Remover, which uses the mask to cut a photograph out,
 * and the Image to 3D Model Converter, which uses it to decide what to inflate
 * into a solid. Lifted here the moment the second one needed it — `CLAUDE.md`
 * rule 31 — rather than copied, because the byte counts, the error vocabulary
 * and the `ImageData` trap below are all things there should be one of.
 *
 * Browser glue, kept beside the arithmetic rather than in the island for the
 * reason `docs/case-studies/watermark-remover.md` gives: what the reader sees is
 * decided by numbers — which phase the progress bar is in, what fraction of the
 * download is done — and those are testable without a canvas as long as they are
 * not tangled up with the `drawImage` calls around them. `readProgress` below is
 * the whole of that, and it is unit-tested; everything under it is the part that
 * genuinely needs a browser.
 */

/**
 * IMG.LY's own name for each weight set, and what it costs to fetch.
 *
 * They live on IMG.LY's CDN rather than in this deployment's `public/`, because
 * the smallest is 42 MB and the largest is 168 MB. Exact byte counts read from
 * their manifest rather than estimated, because they are shown to the reader
 * **before** they commit to the download — a number that is merely plausible is
 * worse here than no number at all. `MODEL_ASSET_VERSION` in
 * `background-remover/domain/constants.ts` records which manifest, beside the
 * `curl` that re-reads it.
 */
export const CUTOUT_MODELS: Record<
    CutoutQuality,
    { readonly model: "isnet_quint8" | "isnet_fp16" | "isnet"; readonly bytes: number }
> = {
    fast: { model: "isnet_quint8", bytes: 44_348_940 },
    balanced: { model: "isnet_fp16", bytes: 88_152_708 },
    best: { model: "isnet", bytes: 176_149_806 },
};

/**
 * The WebAssembly build of the runtime, which is fetched alongside whichever
 * model is chosen. Two of them, because reaching for the GPU pulls the JSEP build
 * instead of the plain one — and the reader is told the total, not the half of it
 * that happens to be the model.
 */
export const RUNTIME_WASM_BYTES = { cpu: 11_819_815 + 25_539, gpu: 23_013_109 + 49_241 } as const;

/**
 * The longest edge the model is ever handed.
 *
 * The mask is computed at the model's own fixed input size whatever it is given,
 * so anything past this is decoded, scaled and thrown away.
 */
export const MAX_SEGMENTATION_SIDE = 1024;

/** How many steps `removeBackground` reports while it is computing. */
const COMPUTE_STEPS = 4;

/**
 * How much of a thrown message is kept for the log. Enough to carry the
 * library's own sentence, short of a whole stack trace.
 */
const MAX_ERROR_DETAIL_LENGTH = 300;

/**
 * Reads one of IMG.LY's progress callbacks.
 *
 * Two vocabularies come through the same three arguments and they mean different
 * things to the reader, which is why this exists rather than a division at the
 * call site:
 *
 * - `fetch:/models/isnet_fp16` with bytes — **the wait that only happens once**.
 *   Worth a percentage and worth naming, because it is 84 MB and somebody on a
 *   phone deserves to know that before they wonder whether the page is broken.
 * - `compute:inference` with `(1, 4)` — the wait that happens every time. Worth
 *   a bar, not worth a byte count.
 *
 * Anything else is ignored rather than guessed at: a future version adding a
 * fifth key must not make the bar jump backwards.
 */
export function readProgress(
    key: string,
    current: number,
    total: number,
): SegmentationProgress | null {
    const ratio = total > 0 && Number.isFinite(current / total) ? clampRatio(current / total) : 0;

    if (key.startsWith("fetch:")) {
        return { phase: "download", ratio };
    }

    if (key.startsWith("compute:")) {
        return { phase: "compute", ratio: clampRatio(current / COMPUTE_STEPS) };
    }

    return null;
}

/**
 * How long the assets have to be arriving before the reader is told they are
 * downloading.
 *
 * The library reports `fetch:` progress whether the bytes come from the network
 * or straight back out of the browser cache, and it cannot tell the difference
 * either. So "Fetching the model…" appeared on **every** run, including the ones
 * where the model was already there and the whole load was over in a blink —
 * which reads as the page doing pointless work every time.
 *
 * Elapsed time is the signal that actually separates the two. A cached read
 * finishes far inside this; a hundred megabytes over a real connection does not.
 * Picked well above a cache read and well below any genuine download, so neither
 * case is a close call.
 */
export const DOWNLOAD_LABEL_DELAY_MS = 700;

/**
 * Which phase to *show*, as opposed to which one the library reported.
 *
 * Kept apart from `readProgress` on purpose: that function's job is to say
 * faithfully what the library said, and this one's is to decide what is worth
 * telling the reader. Folding them together would mean the raw signal is no
 * longer available to the log, and a threshold would be buried in a parser.
 *
 * Computing is always reported as computing — only the download label waits.
 */
export function resolveProgressPhase(
    reported: SegmentationPhase,
    elapsedMs: number,
    thresholdMs = DOWNLOAD_LABEL_DELAY_MS,
): SegmentationPhase {
    if (reported === "compute") {
        return "compute";
    }

    return elapsedMs >= thresholdMs ? "download" : "compute";
}

function clampRatio(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
}

/** What one cut-out costs to download the first time, model plus runtime. */
export function firstRunBytes(quality: CutoutQuality, runtimeBytes: number): number {
    return CUTOUT_MODELS[quality].bytes + runtimeBytes;
}

export type MaskResult =
    | { readonly ok: true; readonly mask: Blob }
    | {
          readonly ok: false;
          readonly reason: SegmentationFailureReason;
          /**
           * The library's own message, carried through for the log and never for
           * the page — an engine's error string in rendered output is the
           * hydration-and-platform trap, and it is not in the reader's language.
           *
           * It exists because the first version of this dropped it, and a real
           * failure in a browser then reported nothing but `removal_failed`,
           * which named the symptom and hid the cause.
           */
          readonly detail: string;
      };

/**
 * Whether a thrown error came from the assets never arriving, or from the model
 * running and failing.
 *
 * Two states, not one — `CLAUDE.md` rule 28. "The weights did not download" is
 * answered by trying again on a better connection; "the model threw" is not, and
 * telling somebody on a train to check their connection when the real fault is a
 * WebGPU driver wastes their afternoon.
 *
 * Matched on the message because that is all the library gives, and **the order
 * of these checks is the whole correctness of it**. IMG.LY appends "Please check
 * if the publicPath is set correctly" to its *session* failure too — so a
 * substring test for `publicPath` alone reports a model that could not start as
 * a CDN that could not be reached, which is the opposite advice. The specific
 * sentence has to win over the generic hint it contains.
 *
 * Every string here is IMG.LY's, so `tests/removal.test.ts` checks them against
 * the shipped bundle rather than trusting this comment.
 */
export function classifyRemovalError(message: string): SegmentationFailureReason {
    const text = message.toLowerCase();

    // Checked first: this message *also* contains "publicPath", and it means the
    // assets arrived and the runtime refused them.
    if (text.includes("failed to create session")) {
        return "removal_failed";
    }

    if (
        text.includes("resource metadata not found") ||
        text.includes("failed to fetch") ||
        text.includes("publicpath")
    ) {
        return "model_unavailable";
    }

    return "removal_failed";
}

/**
 * The alpha channel for one picture, as a picture.
 *
 * `segmentForeground` rather than `removeBackground`, and that is the single most
 * consequential decision in this module.
 *
 * `removeBackground` returns the cut-out at whatever resolution it was handed. To
 * get a 12-megapixel cut-out you must hand it a 12-megapixel image, which means
 * holding a 48 MB tensor, a second 48 MB copy for the output, and the encoder's
 * buffer on top — in a phone browser, on top of the model. Hand it something
 * smaller and the *subject's own pixels* come back smaller, which is a worse
 * picture, not a cheaper one.
 *
 * The mask does not have that problem. The model computes it at its own fixed
 * input size whatever it is given, so segmenting a 2048 px copy loses nothing —
 * and a mask is a smooth, low-frequency image, so scaling it back up over the
 * full-resolution original is what bilinear filtering is genuinely good at. The
 * subject keeps every pixel it arrived with; only the *edge* is computed at model
 * resolution, which is where it was computed either way.
 *
 * That is the same rule the Watermark Remover's case study states as "send the
 * smallest thing that answers the question", applied without a network in sight.
 */
export async function computeAlphaMask(
    /**
     * A PNG blob, never `ImageData` — see `toSegmentationInput` in `canvas.ts`
     * for why the library's own type is wrong about that.
     */
    image: Blob,
    quality: CutoutQuality,
    onProgress: (progress: SegmentationProgress) => void,
): Promise<MaskResult> {
    try {
        // Imported here rather than at the top of the file so a reader who opens
        // the page and never drops a picture in downloads none of it. The
        // library itself then dynamically imports the ONNX runtime, so the
        // WebAssembly glue is a third chunk behind this one.
        const { segmentForeground } = await import("@imgly/background-removal");

        const mask = await segmentForeground(image, {
            model: CUTOUT_MODELS[quality].model,
            // Ask for the GPU. The library probes for a WebGPU adapter and falls
            // back to the WebAssembly build on its own when there is not one, so
            // this is a preference rather than a requirement — and on the
            // machines that have one it is the difference between two seconds
            // and twenty.
            device: "gpu",
            output: { format: "image/png", quality: 1 },
            progress: (key, current, total) => {
                const progress = readProgress(key, current, total);

                if (progress !== null) {
                    onProgress(progress);
                }
            },
        });

        return { ok: true, mask };
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);

        return {
            ok: false,
            reason: classifyRemovalError(message),
            detail: message.slice(0, MAX_ERROR_DETAIL_LENGTH),
        };
    }
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
 * See `computeAlphaMask` above for why this is scaled down at all.
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
