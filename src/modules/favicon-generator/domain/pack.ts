import { context2d, createCanvas, releaseCanvas } from "@/modules/tools/domain/canvas";
import {
    assembleFaviconPack,
    buildWebManifest,
    type FaviconPackFile,
    type FaviconPng,
} from "@/modules/tools/domain/favicon";
import { buildIcoFile, type IcoImage } from "@/modules/tools/domain/ico";
import { encodePixels } from "@/modules/tools/domain/image-codec";
import type { FaviconOptions, IconPlan, InkBox } from "../types";
import { planPack } from "./layout";
import { manifestExtras, resolveAppName } from "./options";
import { drawIcon, measureInk, toGlyphStyle, type GlyphStyle } from "./render";

export type FaviconPackOutcome =
    | { readonly ok: true; readonly files: readonly FaviconPackFile[] }
    | { readonly ok: false; readonly reason: "invisible_text" };

function canvasOf(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = createCanvas({ width: size, height: size });
    const ctx = canvas === null ? null : context2d(canvas);

    if (canvas === null || ctx === null) {
        // A 2D context is refused only when the tab is out of canvas memory —
        // not something the reader caused, so it is not a typed refusal.
        throw new Error("canvas_unavailable");
    }

    return { canvas, ctx };
}

/** One icon, drawn at its own size, as a PNG — or `null` when the text has no ink. */
async function encodeIcon(
    plan: IconPlan,
    style: GlyphStyle,
    ink: InkBox,
): Promise<ArrayBuffer | null> {
    const { canvas, ctx } = canvasOf(plan.size);

    try {
        if (!drawIcon(ctx, plan, style, ink)) {
            return null;
        }

        // Quality is ignored by OxiPNG; PNG is always written losslessly.
        return await encodePixels(ctx.getImageData(0, 0, plan.size, plan.size), "png", 100);
    } finally {
        releaseCanvas(canvas);
    }
}

/**
 * Draws and encodes the whole pack. `stack` is the resolved family list, and
 * its fonts must already be loaded — a canvas draws a font that is still
 * downloading in the fallback, without saying so.
 *
 * Throws only for what the reader did not cause: no canvas memory, a codec
 * that would not load.
 */
export async function buildFaviconPack(
    options: FaviconOptions,
    stack: string,
): Promise<FaviconPackOutcome> {
    const style = toGlyphStyle(options, stack);
    const probe = canvasOf(1);
    const ink = measureInk(probe.ctx, style);

    releaseCanvas(probe.canvas);

    const plan = planPack(options);
    const icoImages: IcoImage[] = [];
    const pngs: FaviconPng[] = [];

    // One at a time: a 512 square in flight per step rather than nine.
    for (const icon of plan.ico) {
        const png = await encodeIcon(icon, style, ink);

        if (png === null) {
            return { ok: false, reason: "invisible_text" };
        }

        icoImages.push({ size: icon.size, png: new Uint8Array(png) });
    }

    for (const entry of plan.pngs) {
        const png = await encodeIcon(entry.plan, style, ink);

        if (png === null) {
            return { ok: false, reason: "invisible_text" };
        }

        pngs.push({ name: entry.name, png });
    }

    return {
        ok: true,
        files: assembleFaviconPack(
            buildIcoFile(icoImages),
            pngs,
            buildWebManifest(resolveAppName(options), manifestExtras(options)),
        ),
    };
}
