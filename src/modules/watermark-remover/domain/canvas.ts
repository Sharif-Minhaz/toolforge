import { MASK_DILATION_PX, MODEL_CANVAS_SIZE } from "./constants";
import { featherRadius } from "./region";
import type { MaskStroke, PixelSize, RemovalRegion } from "../types";

/**
 * The one browser call this module cannot do without, injected so a caller can
 * hand over an off-screen canvas of its own.
 */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const browserCanvasFactory: CanvasFactory = (width, height) => {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
};

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
}

/**
 * Traces the painted strokes in the context's current colour and transform.
 *
 * A one-point stroke is filled as a disc: a `stroke()` over a zero-length path
 * draws nothing, so a single tap on a small watermark would silently paint no
 * mask at all. `grow` widens every stroke, in the coordinate space the context is
 * currently in.
 */
export function paintMaskStrokes(
    context: CanvasRenderingContext2D,
    strokes: readonly MaskStroke[],
    grow = 0,
): void {
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const stroke of strokes) {
        const [first, ...rest] = stroke.points;

        if (first === undefined) {
            continue;
        }

        const radius = Math.max(stroke.radius + grow, 0.5);

        context.beginPath();

        if (rest.length === 0) {
            context.arc(first.x, first.y, radius, 0, Math.PI * 2);
            context.fill();

            continue;
        }

        context.lineWidth = radius * 2;
        context.moveTo(first.x, first.y);

        for (const point of rest) {
            context.lineTo(point.x, point.y);
        }

        context.stroke();
    }
}

/**
 * Cuts `region` out of the picture and scales it to the model's canvas.
 *
 * Exactly `MODEL_CANVAS_SIZE` square, so the worker's own `scale-down` is a
 * no-op and the model is handed the geometry it is told it has.
 */
export async function cropRegionToModelPng(
    source: CanvasImageSource,
    region: RemovalRegion,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<Blob | null> {
    const canvas = createCanvas(MODEL_CANVAS_SIZE, MODEL_CANVAS_SIZE);
    const context = canvas.getContext("2d");

    if (context === null) {
        return null;
    }

    context.imageSmoothingQuality = "high";
    context.drawImage(
        source,
        region.x,
        region.y,
        region.side,
        region.side,
        0,
        0,
        MODEL_CANVAS_SIZE,
        MODEL_CANVAS_SIZE,
    );

    return toPngBlob(canvas);
}

/**
 * The mask the model reads: white where it should repaint, black where it must
 * leave the pixels alone, in the same 512 px square as the crop.
 *
 * The transform maps image pixels onto that square, so the strokes are used
 * exactly as they were recorded and only the dilation has to be converted.
 */
export async function renderModelMaskPng(
    strokes: readonly MaskStroke[],
    region: RemovalRegion,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<Blob | null> {
    const canvas = createCanvas(MODEL_CANVAS_SIZE, MODEL_CANVAS_SIZE);
    const context = canvas.getContext("2d");

    if (context === null) {
        return null;
    }

    context.fillStyle = "#000000";
    context.fillRect(0, 0, MODEL_CANVAS_SIZE, MODEL_CANVAS_SIZE);

    const scale = MODEL_CANVAS_SIZE / region.side;

    context.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    paintMaskStrokes(context, strokes, MASK_DILATION_PX / scale);

    return toPngBlob(canvas);
}

export type ComposeRequest = {
    readonly source: CanvasImageSource;
    readonly size: PixelSize;
    /** The square the worker repainted, at the model's resolution. */
    readonly patch: CanvasImageSource;
    readonly strokes: readonly MaskStroke[];
    readonly region: RemovalRegion;
};

/**
 * Drops the repainted square back onto the original at full resolution.
 *
 * The model returns the whole square, most of which it re-encoded for no reason,
 * so only the painted part is kept: `destination-in` turns the strokes into the
 * patch's alpha channel, blurred by `featherRadius` so its edge fades into the
 * pixels beside it instead of showing a seam. Everything outside stays the
 * reader's own pixels, untouched and at their original size.
 */
export async function composeCleanedImage(
    request: ComposeRequest,
    createCanvas: CanvasFactory = browserCanvasFactory,
): Promise<Blob | null> {
    const { source, size, patch, strokes, region } = request;

    const patchCanvas = createCanvas(region.side, region.side);
    const patchContext = patchCanvas.getContext("2d");

    if (patchContext === null) {
        return null;
    }

    patchContext.imageSmoothingQuality = "high";
    patchContext.drawImage(patch, 0, 0, region.side, region.side);

    patchContext.globalCompositeOperation = "destination-in";
    patchContext.filter = `blur(${featherRadius(region.side)}px)`;
    patchContext.translate(-region.x, -region.y);
    patchContext.fillStyle = "#ffffff";
    patchContext.strokeStyle = "#ffffff";
    paintMaskStrokes(patchContext, strokes);

    const canvas = createCanvas(size.width, size.height);
    const context = canvas.getContext("2d");

    if (context === null) {
        return null;
    }

    context.drawImage(source, 0, 0, size.width, size.height);
    context.drawImage(patchCanvas, region.x, region.y);

    return toPngBlob(canvas);
}
