import { decodeToPixels } from "@/modules/tools/domain/image-codec";
import { readImagePixelSize } from "@/modules/tools/domain/image-element";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import type {
    GeminiCleanResult,
    GeminiFailure,
    GeminiFailureReason,
    GeminiProbeResult,
    NormalizedBox,
} from "../types";
import { browserCanvasFactory, toPngBlob, type CanvasFactory } from "./canvas";
import { describeEngineError } from "./failure-detail";
import { GEMINI_IMAGE_FILE_LIMITS } from "./gemini-constants";
import { cleanGeminiPixels } from "./gemini-image";
import { MAX_FAILURE_DETAIL_LENGTH } from "./video-constants";

export type CleanGeminiOptions = {
    readonly file: File;
    /** The square the watermark is looked for in. */
    readonly box: NormalizedBox;
    /** Repaint the whole search box rather than only the mark found inside it. */
    readonly fillWholeBox: boolean;
    /** Injected so the pipeline can be driven without a document. */
    readonly createCanvas?: CanvasFactory;
};

function failure(reason: GeminiFailureReason, detail?: string): GeminiFailure {
    return detail === undefined
        ? { ok: false, reason }
        : { ok: false, reason, detail: detail.slice(0, MAX_FAILURE_DETAIL_LENGTH) };
}

/**
 * What the browser knows about the picture before any work is done to it.
 *
 * Sized through an `<img>` rather than by decoding to pixels, because the answer
 * is wanted the instant a file is picked — the preview and the search box both
 * need it — and decoding a 24-megapixel PNG to RGBA to learn how wide it is
 * would stall the pick behind work the run is going to do again anyway.
 */
export async function probeGeminiImage(file: File): Promise<GeminiProbeResult> {
    const checked = checkImageFile(file, GEMINI_IMAGE_FILE_LIMITS);

    if (!checked.ok) {
        return failure(checked.reason);
    }

    const url = URL.createObjectURL(file);

    try {
        const size = await readImagePixelSize(url);

        if (size === null || size.width <= 0 || size.height <= 0) {
            return failure("undecodable");
        }

        return {
            ok: true,
            facts: {
                name: file.name,
                type: checked.type,
                bytes: file.size,
                width: size.width,
                height: size.height,
            },
        };
    } catch (caught) {
        return failure("undecodable", describeEngineError(caught));
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Reads a still, takes the mark out of one corner of it, and writes it back.
 *
 * Nothing leaves the browser and no model is involved: the file is decoded by
 * the platform, the corner is un-blended by `gemini-image.ts`, and the result is
 * encoded here. That is why this half has no bot check and no rate limit —
 * there is no service on the other end of it to protect.
 *
 * The arithmetic is deliberately not in this file. Everything below is browser
 * glue — a decode, a canvas, an encode — and everything that decides what the
 * pixels become is pure and tested next door.
 */
export async function cleanGeminiImage(options: CleanGeminiOptions): Promise<GeminiCleanResult> {
    const { file, box, fillWholeBox } = options;
    const createCanvas = options.createCanvas ?? browserCanvasFactory;

    if (file.size === 0) {
        return failure("empty_file");
    }

    // Which step threw, carried out of the `catch` with the message. A single
    // `clean_failed` with no idea which of three stages produced it is a bug
    // report nobody can act on.
    let stage = "decode";

    try {
        const pixels = await decodeToPixels(file, createCanvas);

        if (pixels === null) {
            return failure("undecodable");
        }

        stage = "clean";

        const size = { width: pixels.width, height: pixels.height };
        const outcome = cleanGeminiPixels(pixels.data, size, box, fillWholeBox);

        if (!outcome.ok) {
            return failure(outcome.reason);
        }

        stage = "encode";

        const canvas = createCanvas(size.width, size.height);
        const context = canvas.getContext("2d");

        if (context === null) {
            return failure("no_canvas");
        }

        context.putImageData(pixels, 0, 0);

        // PNG rather than the format it arrived in, and deliberately so: a JPEG
        // in and a JPEG out would put the *whole* picture through a second lossy
        // pass to change one corner of it. Every pixel outside the repainted
        // rectangle should come back exactly as it went in, and only a lossless
        // container can promise that.
        const blob = await toPngBlob(canvas);

        if (blob === null) {
            return failure("clean_failed", "encode: no blob");
        }

        return {
            ok: true,
            image: {
                blob,
                bytes: blob.size,
                width: size.width,
                height: size.height,
                repainted: outcome.report.repainted,
                coverage: outcome.report.coverage,
            },
        };
    } catch (caught) {
        return failure("clean_failed", `${stage}: ${describeEngineError(caught)}`);
    }
}
