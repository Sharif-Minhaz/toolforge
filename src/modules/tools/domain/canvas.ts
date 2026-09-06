import type { PixelSize } from "../types";

/**
 * The two facts about a `<canvas>` that every tool drawing one has to know.
 *
 * Shared because three of them now do, and because the second fact below is not
 * discoverable from the API — a tool that misses it works perfectly until the
 * reader's machine runs out of memory.
 */

/** Everything a canvas here is created through, so the settings are set once. */
export function createCanvas(size: PixelSize): HTMLCanvasElement | null {
    if (size.width <= 0 || size.height <= 0) {
        return null;
    }

    const canvas = document.createElement("canvas");

    canvas.width = size.width;
    canvas.height = size.height;

    return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext("2d");

    if (ctx === null) {
        return null;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    return ctx;
}

/**
 * Hands a canvas's memory back now rather than at the next collection.
 *
 * Dropping the last reference to a canvas makes it *collectable*, not collected
 * — and a tool that redraws on a slider drag allocates one per step. A dozen
 * twelve-megapixel canvases waiting on the collector is half a gigabyte that the
 * tab is charged for and cannot use; it took a reader's whole machine down once.
 *
 * Setting either dimension to zero releases the backing store immediately, in
 * every engine, and is the documented way to do it.
 */
export function releaseCanvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === null) {
        return;
    }

    canvas.width = 0;
    canvas.height = 0;
}
