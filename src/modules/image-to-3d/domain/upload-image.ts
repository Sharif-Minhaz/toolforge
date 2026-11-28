import { createCanvas, context2d, releaseCanvas } from "@/modules/tools/domain/canvas";
import { decodeToDrawable } from "@/modules/tools/domain/image-codec";

import { UPLOAD_JPEG_QUALITY } from "./constants";
import { uploadSize } from "./generation";

/**
 * The picture as it is sent: at most `UPLOAD_EDGE` on its longest side, over
 * white, as a JPEG.
 *
 * The smallest thing that answers the question — see the Watermark Remover's
 * case study. The model reads a few hundred pixels whatever it is sent, so a
 * twelve-megapixel photograph costs upload time and a refusal at the size
 * limit and buys nothing. White rather than black behind transparency, because
 * a cut-out PNG with a black backdrop reads to the model as a dark object.
 *
 * Browser glue around `uploadSize`, which is the part worth testing.
 */
export async function prepareUpload(file: Blob): Promise<Blob | null> {
    const source = await decodeToDrawable(file);

    if (source === null) {
        return null;
    }

    let canvas: HTMLCanvasElement | null = null;

    try {
        const width = "naturalWidth" in source ? source.naturalWidth : source.width;
        const height = "naturalHeight" in source ? source.naturalHeight : source.height;

        if (width <= 0 || height <= 0) {
            return null;
        }

        canvas = createCanvas(uploadSize(width, height));

        const context = canvas === null ? null : context2d(canvas);

        if (canvas === null || context === null) {
            return null;
        }

        // A canvas paint colour under the reader's own picture, not a themed
        // surface — the one place a raw colour literal is correct.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const target = canvas;

        return await new Promise<Blob | null>((resolve) => {
            target.toBlob((blob) => resolve(blob), "image/jpeg", UPLOAD_JPEG_QUALITY);
        });
    } finally {
        if ("close" in source) {
            source.close();
        }

        releaseCanvas(canvas);
    }
}
