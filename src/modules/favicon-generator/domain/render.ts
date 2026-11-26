import type { FaviconOptions, IconPlan, InkBox } from "../types";
import { REFERENCE_FONT_SIZE, ROUNDED_CORNER } from "./constants";
import { canvasFont } from "./fonts";
import { fitGlyph } from "./layout";

/** Everything about the glyph that does not change between sizes. */
export type GlyphStyle = {
    readonly text: string;
    /** A real family list from `fontStack`, never a CSS variable. */
    readonly stack: string;
    readonly bold: boolean;
    readonly foreground: string;
    readonly background: string;
};

/** The text's ink at `REFERENCE_FONT_SIZE`, which `fitGlyph` scales to each icon. */
export function measureInk(ctx: CanvasRenderingContext2D, style: GlyphStyle): InkBox {
    ctx.font = canvasFont(style.stack, style.bold, REFERENCE_FONT_SIZE);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const metrics = ctx.measureText(style.text);

    return {
        left: metrics.actualBoundingBoxLeft,
        right: metrics.actualBoundingBoxRight,
        ascent: metrics.actualBoundingBoxAscent,
        descent: metrics.actualBoundingBoxDescent,
    };
}

function tracePlate(ctx: CanvasRenderingContext2D, plan: IconPlan): void {
    const { size } = plan;

    ctx.beginPath();

    if (plan.plate === "circle") {
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    } else if (plan.plate === "rounded") {
        ctx.roundRect(0, 0, size, size, size * ROUNDED_CORNER);
    } else {
        ctx.rect(0, 0, size, size);
    }
}

/**
 * Draws one icon onto a canvas already sized `plan.size` square. Returns false,
 * having drawn only the plate, when the ink has no area to fit.
 */
export function drawIcon(
    ctx: CanvasRenderingContext2D,
    plan: IconPlan,
    style: GlyphStyle,
    ink: InkBox,
): boolean {
    ctx.clearRect(0, 0, plan.size, plan.size);

    if (plan.plate !== "none") {
        tracePlate(ctx, plan);
        ctx.fillStyle = style.background;
        ctx.fill();
    }

    const layout = fitGlyph(ink, REFERENCE_FONT_SIZE, plan);

    if (layout === null) {
        return false;
    }

    ctx.font = canvasFont(style.stack, style.bold, layout.fontSize);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = style.foreground;
    ctx.fillText(style.text, layout.x, layout.y);

    return true;
}

export function toGlyphStyle(
    options: Pick<FaviconOptions, "text" | "bold" | "foreground" | "background">,
    stack: string,
): GlyphStyle {
    return {
        text: options.text,
        stack,
        bold: options.bold,
        foreground: options.foreground,
        background: options.background,
    };
}
