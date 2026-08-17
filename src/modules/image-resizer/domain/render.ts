import {
    browserCanvasFactory,
    encodePixels,
    RASTER_FORMAT_MIME_TYPES,
    resizePixels,
    type CanvasFactory,
} from "@/modules/tools/domain/image-codec";
import { flattenOntoMatte, isOpaque, WHITE_MATTE } from "@/modules/tools/domain/pixels";
import { composePixels, cropPixels } from "./compose";
import { densityApplies, embedDensity } from "./density";
import { qualityApplies, resolveFormat, supportsAlpha } from "./options";
import { copiesPixels, isPlanTooLarge, planRender } from "./plan";
import type { CropRect, ResizeOptions, ResizeResult, RgbaImage } from "../types";

/**
 * One picture, cropped, resized, encoded.
 *
 * The only impure file in this module, and deliberately thin: every decision it
 * makes was made in `plan.ts`, every pixel it moves is moved by `compose.ts`,
 * and the two things left — Lanczos3 and the encoder — belong to
 * `tools/domain/image-codec.ts`. What is left here is the order.
 *
 * That order is the whole quality argument:
 *
 * 1. **Crop before scaling.** Scaling first and cropping after would resample
 *    pixels that are about to be thrown away, and interpolate the ones at the
 *    crop's edge with neighbours from outside it.
 * 2. **Scale only when the plan says to.** A crop whose output box is its own
 *    size never reaches the resampler at all, so its bytes are the source
 *    bytes — which is what "just remove the exceeded part" has to mean.
 * 3. **Flatten last, and only if the format forces it.** JPEG has no alpha, so
 *    transparency has to become a colour somewhere; doing it before the scale
 *    would blend the matte into edge pixels that were about to move.
 */
export async function renderImage(
    source: RgbaImage,
    sourceType: string,
    crop: CropRect,
    options: ResizeOptions,
): Promise<ResizeResult> {
    const plan = planRender(crop, options);

    if (plan.crop.width < 1 || plan.crop.height < 1) {
        return { ok: false, reason: "empty_crop" };
    }

    // Checked before anything is allocated: a 1% crop scaled to 20000 × 20000
    // starts from almost nothing and still asks for 1.6 GB, and "after" is a
    // dead tab rather than an error message. Both boxes, because zoom can make
    // the resampler's output larger than the file's.
    if (isPlanTooLarge(plan)) {
        return { ok: false, reason: "output_too_large" };
    }

    const format = resolveFormat(sourceType, options.format);

    try {
        const cropped = cropPixels(source, plan.crop);
        const scaled = plan.resamples
            ? await resizePixels(toImageData(cropped), {
                  width: plan.draw.width,
                  height: plan.draw.height,
              })
            : cropped;

        const composed = composePixels(scaled, plan);
        const flattened =
            supportsAlpha(format) || isOpaque(composed)
                ? composed
                : {
                      width: composed.width,
                      height: composed.height,
                      data: flattenOntoMatte(composed, plan.matte ?? WHITE_MATTE),
                  };

        const encoded = await encodePixels(
            toImageData(flattened),
            format,
            qualityApplies(format) ? options.quality : 100,
        );

        const bytes =
            options.embedDensity && densityApplies(format)
                ? embedDensity(new Uint8Array(encoded), format, options.dpi)
                : new Uint8Array(encoded);

        const blob = new Blob([bytes], { type: RASTER_FORMAT_MIME_TYPES[format] });

        return {
            ok: true,
            image: {
                blob,
                bytes: blob.size,
                format,
                size: plan.canvas,
                resampled: !copiesPixels(plan),
            },
        };
    } catch {
        return { ok: false, reason: "encode_failed" };
    }
}

/**
 * `ImageData` from a plain shape.
 *
 * The domain works in `RgbaImage` so its arithmetic is testable without a DOM;
 * the codecs want the real type. This is the one place the two meet, and it is
 * a view over the same buffer rather than a copy.
 */
function toImageData(image: RgbaImage): ImageData {
    return new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height);
}

/**
 * A displayable copy of raw pixels, for the frame the reader is looking at.
 *
 * The browser's own PNG writer rather than OxiPNG, and that is the whole point:
 * this runs every time a crop is applied, and it is throwaway — nothing is
 * downloaded from it and nothing is measured from it. Spending a second of
 * OxiPNG on bytes that exist only to fill an `<img>` for as long as the next
 * crop takes would make the edit feel broken to save nobody anything.
 *
 * Lossless either way, so what is on screen is exactly the pixels that will be
 * exported. `null` when the browser refuses the encode, which the caller treats
 * as "leave the picture where it was".
 */
export function pixelsToPreviewBlob(
    image: RgbaImage,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<Blob | null> {
    return new Promise((resolve) => {
        const canvas = createCanvas(image.width, image.height);
        const context = canvas.getContext("2d");

        if (context === null) {
            resolve(null);

            return;
        }

        context.putImageData(
            new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
            0,
            0,
        );
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
}
