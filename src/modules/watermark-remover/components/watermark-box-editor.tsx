"use client";

import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import {
    BOX_FILL_COLOR,
    BOX_HANDLE_COLOR,
    BOX_HANDLE_RING_COLOR,
    BOX_NUDGE_MULTIPLIER,
    BOX_NUDGE_RATIO,
    BOX_OUTLINE_COLOR,
} from "../domain/video-constants";
import {
    nudgeNormalizedBox,
    resizeBoxEdges,
    resizeNormalizedBox,
    toPixelBox,
} from "../domain/watermark-box";
import type { BoxCorner, BoxEdges, NormalizedBox, PixelSize } from "../types";

/** Four corners, then four sides. Each holds the edges it is drawn on. */
const HANDLES: readonly BoxEdges[] = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
];

const HANDLE_LEFT = { [-1]: "-left-1", 0: "left-1/2 -translate-x-1/2", 1: "-right-1" } as const;
const HANDLE_TOP = { [-1]: "-top-1", 0: "top-1/2 -translate-y-1/2", 1: "-bottom-1" } as const;

function handleCursor({ x, y }: BoxEdges): string {
    if (x === 0) {
        return "cursor-ns-resize";
    }

    if (y === 0) {
        return "cursor-ew-resize";
    }

    return x === y ? "cursor-nwse-resize" : "cursor-nesw-resize";
}

type DragOrigin = {
    readonly pointerX: number;
    readonly pointerY: number;
    readonly box: NormalizedBox;
    /** The handle being dragged; `null` moves the whole box. */
    readonly handle: BoxEdges | null;
};

type WatermarkBoxEditorProps = {
    /** Pixel size of whatever is laid under the box, in the orientation shown. */
    size: PixelSize;
    box: NormalizedBox;
    disabled: boolean;
    /** Accessible name for the box itself. */
    label: string;
    describedById: string;
    /** The corner the box is pinned to while + and − resize it. */
    corner: BoxCorner;
    onBoxChange: (box: NormalizedBox) => void;
    /** The media the box is drawn over — a clip, a still, anything with a size. */
    children: ReactNode;
    /** Anything that belongs under the frame, such as the clip half's scrubber. */
    footer?: ReactNode;
};

/**
 * A picture or a clip with the search box drawn on it, and the two ways to move
 * that box.
 *
 * Deliberately knows nothing about what is under it. It was a video editor when
 * there was one thing to search; the still half needs the same box, the same
 * drag, the same keyboard and the same frame maths, and the only part that
 * differs is the element in the middle. So the media is a child and the sizing
 * is a `PixelSize` — everything else here is about a rectangle.
 */
export function WatermarkBoxEditor({
    size,
    box,
    disabled,
    label,
    describedById,
    corner,
    onBoxChange,
    children,
    footer,
}: WatermarkBoxEditorProps) {
    const frameRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragOrigin | null>(null);

    const pixels = toPixelBox(box, size);

    function beginDrag(event: PointerEvent<HTMLElement>, handle: BoxEdges | null) {
        if (disabled) {
            return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            box,
            handle,
        };
    }

    function continueDrag(event: PointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        const rect = frameRef.current?.getBoundingClientRect();

        if (drag === null || rect === undefined || rect.width === 0 || rect.height === 0) {
            return;
        }

        // The pointer moved on screen; the box lives in the frame's own
        // coordinates. Converting here, once, is what stops a window resize
        // mid-drag from bending the answer.
        const dx = (event.clientX - drag.pointerX) / rect.width;
        const dy = (event.clientY - drag.pointerY) / rect.height;

        if (drag.handle === null) {
            onBoxChange(nudgeNormalizedBox(drag.box, dx, dy, size));

            return;
        }

        // A handle moves the edges it sits on and nothing else, so the box can
        // take any shape the mark needs; the edges across from it stay put.
        onBoxChange(resizeBoxEdges(drag.box, drag.handle, dx, dy, size));
    }

    function endDrag(event: PointerEvent<HTMLElement>) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        dragRef.current = null;
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (disabled) {
            return;
        }

        const step = BOX_NUDGE_RATIO * (event.shiftKey ? BOX_NUDGE_MULTIPLIER : 1);

        const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };

        const move = moves[event.key];

        if (move !== undefined) {
            event.preventDefault();
            onBoxChange(nudgeNormalizedBox(box, move[0], move[1], size));

            return;
        }

        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            onBoxChange(resizeNormalizedBox(box, step, size, corner));

            return;
        }

        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            onBoxChange(resizeNormalizedBox(box, -step, size, corner));
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div
                ref={frameRef}
                // Capped by width rather than by height, so the frame stays laid
                // exactly over the media. A portrait clip at `width: 100%`
                // renders two viewports tall and pushes every control off the
                // bottom; `max-height` plus `object-contain` would fix that and
                // break the box, which is positioned in percentages of *this*
                // element. See `tools/domain/preview-frame.ts`.
                style={{ maxWidth: previewFrameMaxWidth(size) }}
                className="border-border/80 relative mx-auto min-w-0 overflow-hidden rounded-xl border bg-black"
            >
                {children}

                <div
                    // The same shape the mask canvas uses: `application` tells a
                    // screen reader to hand the arrow keys through rather than
                    // spend them on its own navigation, which is the only way
                    // this box moves without a pointer.
                    role="application"
                    aria-label={label}
                    aria-describedby={describedById}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={handleKeyDown}
                    onPointerDown={(event) => beginDrag(event, null)}
                    onPointerMove={continueDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={cn(
                        "focus-visible:ring-ring absolute touch-none rounded-[3px] focus-visible:ring-2 focus-visible:outline-none",
                        disabled ? "cursor-default" : "cursor-move",
                    )}
                    style={{
                        left: `${(pixels.x / size.width) * 100}%`,
                        top: `${(pixels.y / size.height) * 100}%`,
                        width: `${(pixels.width / size.width) * 100}%`,
                        height: `${(pixels.height / size.height) * 100}%`,
                        outline: `2px solid ${BOX_OUTLINE_COLOR}`,
                        backgroundColor: BOX_FILL_COLOR,
                    }}
                >
                    {HANDLES.map((handle) => (
                        <span
                            key={`${handle.x}${handle.y}`}
                            aria-hidden="true"
                            onPointerDown={(event) => {
                                event.stopPropagation();
                                beginDrag(event, handle);
                            }}
                            onPointerMove={continueDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            className={cn(
                                "absolute block size-3 touch-none rounded-[2px]",
                                HANDLE_LEFT[handle.x],
                                HANDLE_TOP[handle.y],
                                disabled ? "cursor-default" : handleCursor(handle),
                            )}
                            style={{
                                backgroundColor: BOX_HANDLE_COLOR,
                                boxShadow: `0 0 0 1px ${BOX_HANDLE_RING_COLOR}`,
                            }}
                        />
                    ))}
                </div>
            </div>

            {footer}
        </div>
    );
}
