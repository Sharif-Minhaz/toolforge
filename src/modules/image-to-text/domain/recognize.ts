import type { Worker } from "tesseract.js";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { context2d, createCanvas, releaseCanvas } from "@/modules/tools/domain/canvas";
import { decodeToDrawable } from "@/modules/tools/domain/image-codec";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import type { PixelSize } from "@/modules/tools/types";
import type { OcrFailure, OcrLanguage, OcrProgress, OcrResult } from "../types";
import { IMAGE_FILE_LIMITS, MAX_RECOGNITION_PIXELS, STALL_MS } from "./constants";
import { tesseractLanguages } from "./languages";
import { readOcrProgress, StallError, watchStall } from "./progress";
import { tidyRecognizedText } from "./text";

/** The largest size with the same proportions and at most `maxPixels` pixels. */
export function fitWithinPixels(size: PixelSize, maxPixels: number): PixelSize {
    const scale = Math.min(1, Math.sqrt(maxPixels / (size.width * size.height)));

    if (scale === 1) {
        return size;
    }

    return {
        width: Math.max(1, Math.floor(size.width * scale)),
        height: Math.max(1, Math.floor(size.height * scale)),
    };
}

/** Upright, opaque, at most `MAX_RECOGNITION_PIXELS`, and a PNG Tesseract can decode. */
async function prepareImage(file: Blob): Promise<Blob | null> {
    const source = await decodeToDrawable(file);

    if (source === null) {
        return null;
    }

    const canvas = createCanvas(
        fitWithinPixels(
            {
                width: "naturalWidth" in source ? source.naturalWidth : source.width,
                height: "naturalHeight" in source ? source.naturalHeight : source.height,
            },
            MAX_RECOGNITION_PIXELS,
        ),
    );

    try {
        const context = canvas === null ? null : context2d(canvas);

        if (canvas === null || context === null) {
            return null;
        }

        // A canvas paint colour, not a theme colour: Tesseract reads a
        // transparent pixel as black, so dark text on a transparent
        // screenshot would vanish into its own background without a white
        // matte under it.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
        releaseCanvas(canvas);

        if ("close" in source) {
            source.close();
        }
    }
}

type RecognizeOptions = {
    /** `index` is the picture's place in `files`. */
    readonly onProgress?: (index: number, progress: OcrProgress) => void;
    /** Each picture's own outcome, as soon as it has one. */
    readonly onResult?: (index: number, result: OcrResult) => void;
    /** Aborting terminates the worker; what follows is a failure to ignore. */
    readonly signal?: AbortSignal;
};

async function readOne(worker: Worker, file: File): Promise<OcrResult> {
    const check = checkImageFile(file, IMAGE_FILE_LIMITS);

    if (!check.ok) {
        return { ok: false, reason: check.reason };
    }

    const image = await prepareImage(file);

    if (image === null) {
        return { ok: false, reason: "undecodable" };
    }

    const { data } = await worker.recognize(image);

    return { ok: true, text: tidyRecognizedText(data.text) };
}

/**
 * Reads the text in each picture, one after another, entirely in this tab.
 *
 * The engine (`tesseract.js`, WebAssembly in a web worker) and its language
 * data come from jsDelivr on first use and are cached in IndexedDB after; the
 * pictures themselves are never sent anywhere. One worker serves the whole
 * batch — starting one costs seconds — and is terminated when the batch ends.
 *
 * A picture that cannot be read is reported through `onResult` and the batch
 * goes on. The promise resolves with a failure only when the engine itself
 * would not start or went quiet; every picture without a result then shares it.
 */
export async function recognizeImages(
    files: readonly File[],
    language: OcrLanguage,
    { onProgress, onResult, signal }: RecognizeOptions = {},
): Promise<OcrFailure | null> {
    let worker: Worker | undefined;
    let current = 0;
    const stop = () => void worker?.terminate();

    signal?.addEventListener("abort", stop, { once: true });

    try {
        await watchStall(STALL_MS, async (alive) => {
            const { createWorker, OEM } = await import("tesseract.js");

            // `createWorker` never settles when the engine or a language file
            // fails to load — `errorHandler` is the only thing told.
            const started = await new Promise<Worker>((resolve, reject) => {
                createWorker([...tesseractLanguages(language)], OEM.LSTM_ONLY, {
                    logger: (message) => {
                        alive();
                        onProgress?.(current, readOcrProgress(message));
                    },
                    errorHandler: (error: unknown) =>
                        reject(error instanceof Error ? error : new Error(String(error))),
                }).then(resolve, reject);
            });

            worker = started;

            for (const [index, file] of files.entries()) {
                signal?.throwIfAborted();
                current = index;

                const result = await readOne(started, file).catch((caught: unknown): OcrResult => ({
                    ok: false,
                    reason: "recognition_failed",
                    detail: describeError(caught),
                }));

                onResult?.(index, result);
                alive();
            }
        });

        return null;
    } catch (caught: unknown) {
        const reason =
            caught instanceof StallError
                ? "stalled"
                : worker === undefined
                  ? "engine_unavailable"
                  : "recognition_failed";

        return { ok: false, reason, detail: describeError(caught) };
    } finally {
        signal?.removeEventListener("abort", stop);
        await worker?.terminate().catch((caught: unknown) => {
            logEvent("warn", "image_to_text.terminate_failed", { error: describeError(caught) });
        });
    }
}
