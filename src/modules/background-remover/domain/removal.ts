import type { CutoutFailureReason, CutoutQuality } from "../types";
import { CUTOUT_MODELS } from "./constants";

/**
 * Driving the segmentation model.
 *
 * Browser glue, kept beside the arithmetic rather than in the island for the
 * reason `docs/case-studies/watermark-remover.md` gives: what the reader sees is
 * decided by numbers — which phase the progress bar is in, what fraction of the
 * download is done — and those are testable without a canvas as long as they are
 * not tangled up with the `drawImage` calls around them. `readProgress` below is
 * the whole of that, and it is unit-tested; everything under it is the part that
 * genuinely needs a browser.
 */

export type ProgressPhase = "download" | "compute";

export type CutoutProgress = {
    readonly phase: ProgressPhase;
    /** 0–1. Never `NaN`, whatever the library reports. */
    readonly ratio: number;
};

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
export function readProgress(key: string, current: number, total: number): CutoutProgress | null {
    const ratio = total > 0 && Number.isFinite(current / total) ? clampRatio(current / total) : 0;

    if (key.startsWith("fetch:")) {
        return { phase: "download", ratio };
    }

    if (key.startsWith("compute:")) {
        return { phase: "compute", ratio: clampRatio(current / COMPUTE_STEPS) };
    }

    return null;
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
          readonly reason: CutoutFailureReason;
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
export function classifyRemovalError(message: string): CutoutFailureReason {
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
    onProgress: (progress: CutoutProgress) => void,
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
