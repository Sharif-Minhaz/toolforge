import type { Worker } from "tesseract.js";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { context2d, createCanvas, releaseCanvas } from "@/modules/tools/domain/canvas";
import { decodeToDrawable } from "@/modules/tools/domain/image-codec";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import type { PixelSize } from "@/modules/tools/types";
import type { OcrLanguage, OcrProgress, OcrResult } from "../types";
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
    readonly onProgress?: (progress: OcrProgress) => void;
    /** Aborting terminates the worker; the result that follows is a failure to ignore. */
    readonly signal?: AbortSignal;
};

/**
 * Reads the text in a picture, entirely in this tab.
 *
 * The engine (`tesseract.js`, WebAssembly in a web worker) and its language
 * data come from jsDelivr on first use and are cached in IndexedDB after; the
 * picture itself is never sent anywhere. One worker per run, terminated when
 * it ends: runs are rare, and a worker holds tens of megabytes.
 */
export async function recognizeImage(
    file: File,
    language: OcrLanguage,
    { onProgress, signal }: RecognizeOptions = {},
): Promise<OcrResult> {
    const check = checkImageFile(file, IMAGE_FILE_LIMITS);

    if (!check.ok) {
        return { ok: false, reason: check.reason };
    }

    const image = await prepareImage(file);

    if (image === null) {
        return { ok: false, reason: "undecodable" };
    }

    let worker: Worker | undefined;
    let stage: "loading" | "recognizing" = "loading";
    const stop = () => void worker?.terminate();

    signal?.addEventListener("abort", stop, { once: true });

    try {
        const text = await watchStall(STALL_MS, async (alive) => {
            const { createWorker, OEM } = await import("tesseract.js");

            // `createWorker` never settles when the engine or a language file
            // fails to load — `errorHandler` is the only thing told.
            worker = await new Promise<Worker>((resolve, reject) => {
                createWorker([...tesseractLanguages(language)], OEM.LSTM_ONLY, {
                    logger: (message) => {
                        alive();
                        onProgress?.(readOcrProgress(message));
                    },
                    errorHandler: (error: unknown) =>
                        reject(error instanceof Error ? error : new Error(String(error))),
                }).then(resolve, reject);
            });

            signal?.throwIfAborted();
            stage = "recognizing";

            const { data } = await worker.recognize(image);

            return data.text;
        });

        return { ok: true, text: tidyRecognizedText(text) };
    } catch (caught: unknown) {
        const reason =
            caught instanceof StallError
                ? "stalled"
                : stage === "loading"
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
