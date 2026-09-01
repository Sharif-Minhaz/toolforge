"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
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
    referenceSide,
    resizeNormalizedBox,
    toPixelBox,
} from "../domain/watermark-box";
import type { NormalizedBox, SourceVideoFacts } from "../types";

type DragOrigin = {
    readonly pointerX: number;
    readonly pointerY: number;
    readonly box: NormalizedBox;
    readonly mode: "move" | "resize";
};

type WatermarkBoxEditorProps = {
    /** Object URL of the picked clip. */
    url: string;
    facts: SourceVideoFacts;
    box: NormalizedBox;
    disabled: boolean;
    /** Accessible name for the box itself. */
    label: string;
    /** Accessible name for the frame slider. */
    scrubLabel: string;
    previewLabel: string;
    describedById: string;
    onBoxChange: (box: NormalizedBox) => void;
};

/**
 * The clip with the search box drawn on it, and the two ways to move that box.
 *
 * The video carries no native controls on purpose. A browser draws its control
 * bar across the bottom of the frame, which is exactly where a Gemini or Veo
 * watermark sits, so the controls and the thing they exist to help you see would
 * be fighting over the same forty pixels. A slider below the frame does the same
 * job with none of the overlap, and leaves the whole picture free for the box.
 */
export function WatermarkBoxEditor({
    url,
    facts,
    box,
    disabled,
    label,
    scrubLabel,
    previewLabel,
    describedById,
    onBoxChange,
}: WatermarkBoxEditorProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragOrigin | null>(null);
    const [time, setTime] = useState(0);

    const size = { width: facts.width, height: facts.height };
    const pixels = toPixelBox(box, size);

    function beginDrag(event: PointerEvent<HTMLElement>, mode: DragOrigin["mode"]) {
        if (disabled) {
            return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            box,
            mode,
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

        if (drag.mode === "move") {
            onBoxChange(nudgeNormalizedBox(drag.box, dx, dy, size));

            return;
        }

        // Dragging the top-left handle away from the pinned bottom-right corner
        // grows the square; the two axes are averaged so a diagonal drag does
        // not count twice.
        const reference = referenceSide(size);
        const delta = -((dx * size.width + dy * size.height) / 2) / reference;

        onBoxChange(resizeNormalizedBox(drag.box, delta, size));
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
            onBoxChange(resizeNormalizedBox(box, step, size));

            return;
        }

        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            onBoxChange(resizeNormalizedBox(box, -step, size));
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div
                ref={frameRef}
                className="border-border/80 relative min-w-0 overflow-hidden rounded-xl border bg-black"
            >
                <video
                    ref={videoRef}
                    src={url}
                    muted
                    playsInline
                    preload="auto"
                    aria-label={previewLabel}
                    className="block h-auto w-full"
                    onLoadedMetadata={() => setTime(0)}
                />

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
                    onPointerDown={(event) => beginDrag(event, "move")}
                    onPointerMove={continueDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={cn(
                        "focus-visible:ring-ring absolute touch-none rounded-[3px] focus-visible:ring-2 focus-visible:outline-none",
                        disabled ? "cursor-default" : "cursor-move",
                    )}
                    style={{
                        left: `${(pixels.x / facts.width) * 100}%`,
                        top: `${(pixels.y / facts.height) * 100}%`,
                        width: `${(pixels.width / facts.width) * 100}%`,
                        height: `${(pixels.height / facts.height) * 100}%`,
                        outline: `2px solid ${BOX_OUTLINE_COLOR}`,
                        backgroundColor: BOX_FILL_COLOR,
                    }}
                >
                    <span
                        aria-hidden="true"
                        onPointerDown={(event) => {
                            event.stopPropagation();
                            beginDrag(event, "resize");
                        }}
                        onPointerMove={continueDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className={cn(
                            "absolute -top-1 -left-1 block size-3 touch-none rounded-[2px]",
                            disabled ? "cursor-default" : "cursor-nwse-resize",
                        )}
                        style={{
                            backgroundColor: BOX_HANDLE_COLOR,
                            boxShadow: `0 0 0 1px ${BOX_HANDLE_RING_COLOR}`,
                        }}
                    />
                </div>
            </div>

            <Slider
                aria-label={scrubLabel}
                value={time}
                min={0}
                max={Math.max(facts.durationSeconds, 0.1)}
                step={0.05}
                disabled={disabled}
                onValueChange={(next) => {
                    const seconds = Array.isArray(next) ? (next[0] ?? 0) : next;

                    setTime(seconds);

                    if (videoRef.current !== null) {
                        videoRef.current.currentTime = seconds;
                    }
                }}
                className="min-w-0"
            />
        </div>
    );
}
