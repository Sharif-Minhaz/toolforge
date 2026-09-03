import { decodeToPixels } from "@/modules/tools/domain/image-codec";
import { readImagePixelSize } from "@/modules/tools/domain/image-element";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import type {
    BoxCorner,
    GeminiCleanResult,
    GeminiFailure,
    GeminiFailureReason,
    GeminiProbeResult,
    NormalizedBox,
    PixelSize,
} from "../types";
import { browserCanvasFactory, toPngBlob, type CanvasFactory } from "./canvas";
import { describeEngineError } from "./failure-detail";
import { GEMINI_IMAGE_FILE_LIMITS } from "./gemini-constants";
import { toPixelBox } from "./watermark-box";
import {
    applyGeminiMark,
    findGeminiMark,
    scanGeminiCorners,
    type GeminiMark,
    type GeminiScan,
} from "./gemini-image";
import { MAX_FAILURE_DETAIL_LENGTH } from "./video-constants";

export type CleanGeminiOptions = {
    readonly file: File;
    /**
     * The square the watermark is looked for in, or `null` to search for it.
     *
     * `null` is the first run and the common case: the reader dropped a file and
     * has not told the tool anything. A box is what comes back after they have
     * moved one, and running against it again is how a correction is applied.
     */
    readonly box: NormalizedBox | null;
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
 * Dresses a fixed-box find as a scan result, so both paths hand back the same
 * shape. The corner is derived rather than stored: a box the reader dragged
 * belongs to whichever corner it is nearest, and that is the corner the resize
 * handle and the reset button then answer to.
 */
function withBox(mark: GeminiMark | null, box: NormalizedBox, size: PixelSize): GeminiScan | null {
    if (mark === null) {
        return null;
    }

    // Measured in pixels rather than in the normalized numbers: `x` and `y` are
    // shares of each axis while `side` is a share of the shorter one, so adding
    // them would put the centre of a box on a portrait picture in the wrong
    // half.
    const pixels = toPixelBox(box, size);
    const half = pixels.x + pixels.width / 2 < size.width / 2 ? "left" : "right";
    const level = pixels.y + pixels.height / 2 < size.height / 2 ? "top" : "bottom";
    const corner: BoxCorner = `${level}-${half}`;

    return { ...mark, box, corner };
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

        // The detection is a second or two of synchronous arithmetic on a large
        // picture, and four corners of it when nobody has said where to look.
        // Yielding once here is what lets the button's spinner reach the screen
        // before the main thread stops answering.
        await Promise.resolve();

        const found =
            box === null
                ? scanGeminiCorners(pixels.data, size)
                : withBox(findGeminiMark(pixels.data, size, box, fillWholeBox), box, size);

        if (found === null) {
            return failure("mark_not_found");
        }

        const report = applyGeminiMark(pixels.data, size, found);

        if (report === null) {
            return failure("mark_not_found");
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
                repainted: report.repainted,
                coverage: report.coverage,
                box: found.box,
                corner: found.corner,
            },
        };
    } catch (caught) {
        return failure("clean_failed", `${stage}: ${describeEngineError(caught)}`);
    }
}
