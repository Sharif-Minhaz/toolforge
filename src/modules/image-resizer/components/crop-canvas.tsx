"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import { moveCrop, resizeCropTo } from "../domain/crop";
import { CROP_HANDLES, type CropHandle, type CropRect } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * The crop box over the picture.
 *
 * Everything this component knows about geometry is one conversion — client
 * coordinates to the source image's pixel space — and everything after that is
 * `domain/crop.ts`. That split is deliberate: the preview is whatever width the
 * viewport allows and changes when the window does, so a crop reasoned about in
 * screen pixels silently means something else after a rotation or a sidebar
 * collapse. Converting once, at the edge, is what keeps the stored crop true.
 *
 * The box is positioned in **percentages** rather than pixels, so it stays
 * exactly over the same part of the picture as the preview reflows, with no
 * measurement and no resize observer.
 */

const HANDLE_POSITION: Record<CropHandle, string> = {
    nw: "-top-1 -left-1 cursor-nwse-resize",
    n: "-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
    ne: "-top-1 -right-1 cursor-nesw-resize",
    e: "top-1/2 -right-1 -translate-y-1/2 cursor-ew-resize",
    se: "-right-1 -bottom-1 cursor-nwse-resize",
    s: "-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
    sw: "-bottom-1 -left-1 cursor-nesw-resize",
    w: "top-1/2 -left-1 -translate-y-1/2 cursor-ew-resize",
};

/** Which way each handle's own arrow keys grow the box. */
const HANDLE_STEP: Record<CropHandle, { x: number; y: number }> = {
    nw: { x: -1, y: -1 },
    n: { x: 0, y: -1 },
    ne: { x: 1, y: -1 },
    e: { x: 1, y: 0 },
    se: { x: 1, y: 1 },
    s: { x: 0, y: 1 },
    sw: { x: -1, y: 1 },
    w: { x: -1, y: 0 },
};

const HANDLE_LABEL_KEY = {
    nw: "handleNw",
    n: "handleN",
    ne: "handleNe",
    e: "handleE",
    se: "handleSe",
    s: "handleS",
    sw: "handleSw",
    w: "handleW",
} as const satisfies Record<CropHandle, string>;

type Drag = {
    readonly kind: "move" | "resize";
    readonly handle: CropHandle;
    readonly startX: number;
    readonly startY: number;
    readonly startCrop: CropRect;
};

type CropCanvasProps = {
    readonly previewUrl: string;
    readonly alt: string;
    readonly source: PixelSize;
    readonly crop: CropRect;
    /** The quotient the box must keep, or `null` for a free drag. */
    readonly ratio: number | null;
    readonly disabled?: boolean;
    readonly onChange: (crop: CropRect) => void;
    /**
     * Enter, with the box focused, is the same press as the Crop button.
     *
     * Scoped to the box rather than to the window on purpose: a global Enter
     * would swallow the key in the ratio field and the dimension inputs, where
     * it means something else entirely.
     */
    readonly onCommit: () => void;
};

export function CropCanvas({
    previewUrl,
    alt,
    source,
    crop,
    ratio,
    disabled = false,
    onChange,
    onCommit,
}: CropCanvasProps) {
    const t = useTranslations("imageResizer.workbench");

    const frame = useRef<HTMLDivElement | null>(null);
    const drag = useRef<Drag | null>(null);

    /** Client coordinates in the source picture's own pixel space. */
    function toSourcePoint(event: PointerEvent): { x: number; y: number } | null {
        const box = frame.current?.getBoundingClientRect();

        if (box === undefined || box.width === 0 || box.height === 0) {
            return null;
        }

        return {
            x: ((event.clientX - box.left) / box.width) * source.width,
            y: ((event.clientY - box.top) / box.height) * source.height,
        };
    }

    function begin(event: PointerEvent, kind: Drag["kind"], handle: CropHandle) {
        if (disabled) {
            return;
        }

        const point = toSourcePoint(event);

        if (point === null) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        drag.current = { kind, handle, startX: point.x, startY: point.y, startCrop: crop };
    }

    function move(event: PointerEvent) {
        const active = drag.current;
        const point = active === null ? null : toSourcePoint(event);

        if (active === null || point === null) {
            return;
        }

        onChange(
            active.kind === "move"
                ? moveCrop(
                      active.startCrop,
                      point.x - active.startX,
                      point.y - active.startY,
                      source,
                  )
                : resizeCropTo(active.startCrop, active.handle, point, source, ratio),
        );
    }

    function end(event: PointerEvent) {
        if (drag.current !== null) {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    function nudge(event: KeyboardEvent, handle: CropHandle | null) {
        if (event.key === "Enter" && !disabled) {
            event.preventDefault();
            onCommit();

            return;
        }

        const step =
            event.key === "ArrowLeft"
                ? { x: -1, y: 0 }
                : event.key === "ArrowRight"
                  ? { x: 1, y: 0 }
                  : event.key === "ArrowUp"
                    ? { x: 0, y: -1 }
                    : event.key === "ArrowDown"
                      ? { x: 0, y: 1 }
                      : null;

        if (step === null || disabled) {
            return;
        }

        event.preventDefault();

        const distance = event.shiftKey ? 10 : 1;

        if (handle === null) {
            onChange(moveCrop(crop, step.x * distance, step.y * distance, source));

            return;
        }

        // A handle's arrows move the handle itself, so the box grows and
        // shrinks under the same keys that would drag it.
        const grow = HANDLE_STEP[handle];
        const pointer = {
            x: crop.x + (grow.x < 0 ? 0 : crop.width) + step.x * distance,
            y: crop.y + (grow.y < 0 ? 0 : crop.height) + step.y * distance,
        };

        onChange(resizeCropTo(crop, handle, pointer, source, ratio));
    }

    const percent = {
        left: `${(crop.x / source.width) * 100}%`,
        top: `${(crop.y / source.height) * 100}%`,
        width: `${(crop.width / source.width) * 100}%`,
        height: `${(crop.height / source.height) * 100}%`,
    };

    return (
        <div
            ref={frame}
            // Capped by width rather than by height, so the frame still hugs the
            // picture exactly — the crop box and every pointer reading are
            // measured against this element. See `tools/domain/preview-frame.ts`.
            style={{ maxWidth: previewFrameMaxWidth(source) }}
            className="bg-muted/40 ring-border/70 relative mx-auto min-w-0 touch-none overflow-hidden rounded-xl ring-1 select-none ring-inset"
        >
            {/* An object URL for a file the reader just picked: there is no
                remote source for `next/image` to optimise, and the crop maths
                depends on the element filling its frame exactly. */}
            <img
                src={previewUrl}
                alt={alt}
                draggable={false}
                className="block h-auto w-full max-w-full"
            />

            <div
                role="group"
                aria-label={t("cropBoxLabel")}
                tabIndex={disabled ? -1 : 0}
                style={percent}
                onPointerDown={(event) => begin(event, "move", "se")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onKeyDown={(event) => nudge(event, null)}
                className={cn(
                    "border-primary focus-visible:ring-ring absolute border-2 focus-visible:ring-2 focus-visible:outline-none",
                    // A scrim painted over a photograph rather than a surface in
                    // the design system, which is the one case `CLAUDE.md` rule
                    // 23 exempts: it has to read as "not selected" over an
                    // arbitrary picture, in both themes, and no token means that.
                    "shadow-[0_0_0_9999px_oklch(0_0_0/0.55)]",
                    disabled ? "cursor-default" : "cursor-move",
                )}
            >
                <span
                    aria-hidden="true"
                    className="border-primary-foreground/35 pointer-events-none absolute inset-0 border-[0.5px]"
                />

                {/* Thirds, which is what a person composing a portrait is aiming at. */}
                <span
                    aria-hidden="true"
                    className="bg-primary-foreground/25 pointer-events-none absolute inset-y-0 left-1/3 w-px"
                />
                <span
                    aria-hidden="true"
                    className="bg-primary-foreground/25 pointer-events-none absolute inset-y-0 left-2/3 w-px"
                />
                <span
                    aria-hidden="true"
                    className="bg-primary-foreground/25 pointer-events-none absolute inset-x-0 top-1/3 h-px"
                />
                <span
                    aria-hidden="true"
                    className="bg-primary-foreground/25 pointer-events-none absolute inset-x-0 top-2/3 h-px"
                />

                {CROP_HANDLES.map((handle) => (
                    <button
                        key={handle}
                        type="button"
                        disabled={disabled}
                        aria-label={t(HANDLE_LABEL_KEY[handle])}
                        onPointerDown={(event) => begin(event, "resize", handle)}
                        onPointerMove={move}
                        onPointerUp={end}
                        onPointerCancel={end}
                        onKeyDown={(event) => nudge(event, handle)}
                        className={cn(
                            "bg-primary ring-primary-foreground/70 focus-visible:ring-ring absolute size-3 rounded-full ring-2 focus-visible:ring-2 focus-visible:outline-none",
                            HANDLE_POSITION[handle],
                        )}
                    />
                ))}
            </div>
        </div>
    );
}
