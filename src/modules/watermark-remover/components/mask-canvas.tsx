"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import {
    CARET_RING_COLOR,
    CARET_SHADOW_COLOR,
    CARET_STEP_MULTIPLIER,
    CARET_STEP_RATIO,
    MASK_PAINT_COLOR,
} from "../domain/constants";
import { paintMaskStrokes } from "../domain/canvas";
import {
    appendStrokePoint,
    fitOverlaySize,
    mapToImagePoint,
    nudgeCaret,
    scaleToImage,
    type CaretDirection,
} from "../domain/mask";
import type { MaskStroke, PixelSize, Point, SourceImageFacts } from "../types";

const ARROW_DIRECTIONS: Record<string, CaretDirection> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

type MaskCanvasProps = {
    /** Object URL of the picked file. */
    url: string;
    /**
     * The picked file's facts, which is also where the pixel dimensions come
     * from. Passed as the one object rather than a `{ width, height }` built at
     * the call site: this one is created once per pick, so every handler and the
     * redraw can depend on it without firing on each parent render.
     */
    facts: SourceImageFacts;
    alt: string;
    strokes: readonly MaskStroke[];
    /** Brush diameter in the preview's display pixels. */
    brush: number;
    disabled: boolean;
    label: string;
    /** Points at the instructions paragraph the reader needs before painting. */
    describedById: string;
    onStrokesChange: (next: readonly MaskStroke[]) => void;
};

/**
 * The picture with a paintable overlay on top.
 *
 * The canvas is laid exactly over the image and both are sized by the same
 * element, so one scale factor converts a pointer position into image pixels —
 * which is what every stroke is stored in. Recording image pixels rather than
 * display ones means a window resize, a sidebar collapse, or a rotation cannot
 * bend a stroke that was already painted.
 *
 * A brush is a pointer gesture, so the canvas also takes focus and offers a
 * crosshair: arrows move it, `Enter` or `Space` dabs. Without that the tool would
 * be unusable without a mouse.
 */
export function MaskCanvas({
    url,
    facts,
    alt,
    strokes,
    brush,
    disabled,
    label,
    describedById,
    onStrokesChange,
}: MaskCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const paintingRef = useRef(false);

    const size: PixelSize = { width: facts.width, height: facts.height };

    const [caret, setCaret] = useState<Point>({ x: size.width / 2, y: size.height / 2 });
    const [focused, setFocused] = useState(false);

    const overlay = fitOverlaySize(size);

    // Imperative redraw rather than state: the canvas is the rendered output, and
    // there is nothing about it for React to diff.
    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
            return;
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        if (facts.width <= 0) {
            return;
        }

        const scale = canvas.width / facts.width;

        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.fillStyle = MASK_PAINT_COLOR;
        context.strokeStyle = MASK_PAINT_COLOR;
        paintMaskStrokes(context, strokes);

        if (!focused || disabled) {
            return;
        }

        // Drawn twice, dark under light, so the crosshair stays visible over both
        // a white sky and a black shadow.
        const radius = Math.max(brushRadiusInImagePixels(canvas, brush, facts.width), 4);

        for (const [color, width] of [
            [CARET_SHADOW_COLOR, 4 / scale],
            [CARET_RING_COLOR, 2 / scale],
        ] as const) {
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = width;
            context.arc(caret.x, caret.y, radius, 0, Math.PI * 2);
            context.stroke();
        }
    }, [strokes, facts.width, facts.height, caret, focused, disabled, brush]);

    function brushRadius(canvas: HTMLCanvasElement): number {
        return brushRadiusInImagePixels(canvas, brush, facts.width);
    }

    function toImagePoint(event: PointerEvent<HTMLCanvasElement>): Point {
        const rect = event.currentTarget.getBoundingClientRect();

        return mapToImagePoint({ x: event.clientX, y: event.clientY }, rect, size);
    }

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
        if (disabled || event.button !== 0) {
            return;
        }

        // Capture, so a stroke that leaves the canvas keeps being tracked and
        // ends where the reader lifted the pointer rather than at the edge.
        event.currentTarget.setPointerCapture(event.pointerId);
        paintingRef.current = true;

        const point = toImagePoint(event);

        setCaret(point);
        onStrokesChange([
            ...strokes,
            { radius: brushRadius(event.currentTarget), points: [point] },
        ]);
    }

    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
        const current = strokes.at(-1);

        if (!paintingRef.current || current === undefined) {
            return;
        }

        const extended = appendStrokePoint(current, toImagePoint(event));

        if (extended === current) {
            return;
        }

        onStrokesChange([...strokes.slice(0, -1), extended]);
    }

    function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
        if (!paintingRef.current) {
            return;
        }

        paintingRef.current = false;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
        if (disabled) {
            return;
        }

        const direction = ARROW_DIRECTIONS[event.key];

        if (direction !== undefined) {
            event.preventDefault();

            const step =
                size.width * CARET_STEP_RATIO * (event.shiftKey ? CARET_STEP_MULTIPLIER : 1);

            setCaret((current) => nudgeCaret(current, direction, step, size));

            return;
        }

        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        onStrokesChange([
            ...strokes,
            { radius: brushRadius(event.currentTarget), points: [caret] },
        ]);
    }

    return (
        <div
            // Capped by width rather than by height, so the canvas stays laid
            // exactly over the picture — one scale factor still converts a
            // pointer position into image pixels, which is what every stroke is
            // stored in. See `tools/domain/preview-frame.ts`.
            style={{ maxWidth: previewFrameMaxWidth(size) }}
            className="ring-border/70 bg-muted/40 relative mx-auto min-w-0 overflow-hidden rounded-xl ring-1 ring-inset"
        >
            {/*
             * A plain `<img>`, deliberately: the source is an object URL for a
             * file the reader just chose, so there is no origin to allowlist and
             * nothing for `next/image` to optimise.
             */}
            <img src={url} alt={alt} decoding="async" className="block h-auto w-full" />

            <canvas
                ref={canvasRef}
                width={overlay.width}
                height={overlay.height}
                role="application"
                aria-label={label}
                aria-describedby={describedById}
                aria-disabled={disabled}
                tabIndex={disabled ? -1 : 0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className={cn(
                    "absolute inset-0 h-full w-full touch-none",
                    "focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none",
                    disabled ? "cursor-not-allowed" : "cursor-crosshair",
                )}
            />
        </div>
    );
}

/**
 * The brush is chosen in display pixels — what the reader sees under the cursor —
 * and stored in image pixels, so the same setting covers the same part of the
 * picture however the preview happens to be scaled.
 */
function brushRadiusInImagePixels(
    canvas: HTMLCanvasElement,
    brush: number,
    imageWidth: number,
): number {
    return scaleToImage(brush, canvas.getBoundingClientRect(), imageWidth) / 2;
}
