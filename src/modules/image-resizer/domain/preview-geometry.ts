import type { RenderPlan } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * The output, expressed as percentages a browser can lay out.
 *
 * The preview has to answer "what will I get" while the reader is still moving
 * the controls, and the honest way to do that is to show the composed result
 * rather than the source picture. Doing it with pixels would mean decoding,
 * scaling and compositing on every keystroke — hundreds of megabytes of work
 * for a thing nobody downloads.
 *
 * So it is done with three nested boxes and no pixel work at all:
 *
 * ```
 * canvas   aspect-ratio: canvas.width / canvas.height, background = matte
 *   draw   the scaled crop, positioned as a % of the canvas — may overflow it
 *          under `cover`, which the canvas clips
 *     img  the whole picture, blown up so that the *crop* fills the draw box
 * ```
 *
 * Every number comes from the same `RenderPlan` the renderer reads, so the
 * preview cannot drift from the file: there is one geometry, and this is a
 * second reading of it rather than a second copy.
 */

export type PreviewLayout = {
    /** For `aspect-ratio` on the canvas box. */
    readonly canvasAspect: string;
    /** The scaled crop's box, as percentages of the canvas. */
    readonly draw: {
        readonly left: string;
        readonly top: string;
        readonly width: string;
        readonly height: string;
    };
    /**
     * The whole picture inside the draw box, as percentages of it.
     *
     * Larger than 100% and offset negatively whenever the crop is a sub-rect:
     * that is what makes the draw box show the crop rather than the picture,
     * with no second image and no canvas.
     */
    readonly image: {
        readonly left: string;
        readonly top: string;
        readonly width: string;
        readonly height: string;
    };
};

function percent(value: number): string {
    // Rounded to four places: enough that a 20000-pixel canvas cannot be a
    // pixel out, short enough not to write a 17-digit float into the DOM.
    return `${Math.round(value * 10_000) / 10_000}%`;
}

export function previewLayout(source: PixelSize, plan: RenderPlan): PreviewLayout {
    const { canvas, draw, crop } = plan;

    const safeCanvas = { width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) };
    const safeCrop = { width: Math.max(1, crop.width), height: Math.max(1, crop.height) };

    return {
        canvasAspect: `${safeCanvas.width} / ${safeCanvas.height}`,
        draw: {
            left: percent((draw.x / safeCanvas.width) * 100),
            top: percent((draw.y / safeCanvas.height) * 100),
            width: percent((draw.width / safeCanvas.width) * 100),
            height: percent((draw.height / safeCanvas.height) * 100),
        },
        image: {
            left: percent(-(crop.x / safeCrop.width) * 100),
            top: percent(-(crop.y / safeCrop.height) * 100),
            width: percent((source.width / safeCrop.width) * 100),
            height: percent((source.height / safeCrop.height) * 100),
        },
    };
}
