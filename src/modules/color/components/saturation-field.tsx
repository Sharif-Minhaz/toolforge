"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { clamp } from "../domain/convert";

type SaturationFieldProps = {
    hue: number;
    saturation: number;
    value: number;
    label: string;
    /** Reads both axes aloud, since one `aria-valuenow` cannot describe them. */
    valueText: string;
    onChange: (saturation: number, value: number) => void;
};

const STEP = 1;
const LARGE_STEP = 10;

/**
 * The square every colour picker opens with: saturation left to right, value
 * bottom to top, at the current hue.
 *
 * Two axes do not fit the one-dimensional `slider` role cleanly, so
 * `aria-valuetext` carries both numbers while `aria-valuenow` tracks
 * saturation. Every position is also reachable by typing an `hsv()` value into
 * the field above, which is the path that stays exact.
 */
export function SaturationField({
    hue,
    saturation,
    value,
    label,
    valueText,
    onChange,
}: SaturationFieldProps) {
    const surface = useRef<HTMLDivElement>(null);

    function emitFromPointer(event: PointerEvent<HTMLDivElement>) {
        const bounds = surface.current?.getBoundingClientRect();

        if (bounds === undefined || bounds.width === 0 || bounds.height === 0) {
            return;
        }

        onChange(
            clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
            clamp((1 - (event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
        );
    }

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        // Capturing keeps the drag alive once the pointer leaves the square,
        // which is how every native slider behaves.
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        emitFromPointer(event);
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            emitFromPointer(event);
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const distance = event.shiftKey ? LARGE_STEP : STEP;

        const move = (deltaSaturation: number, deltaValue: number) => {
            event.preventDefault();
            onChange(
                clamp(saturation + deltaSaturation, 0, 100),
                clamp(value + deltaValue, 0, 100),
            );
        };

        switch (event.key) {
            case "ArrowLeft":
                return move(-distance, 0);
            case "ArrowRight":
                return move(distance, 0);
            case "ArrowUp":
                return move(0, distance);
            case "ArrowDown":
                return move(0, -distance);
            case "Home":
                return move(-saturation, 0);
            case "End":
                return move(100 - saturation, 0);
            case "PageUp":
                return move(0, 100 - value);
            case "PageDown":
                return move(0, -value);
            default:
                return undefined;
        }
    }

    return (
        <div
            ref={surface}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(saturation)}
            aria-valuetext={valueText}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onKeyDown={handleKeyDown}
            className="ring-border/70 focus-visible:ring-ring relative h-56 w-full cursor-crosshair touch-none overflow-hidden rounded-xl ring-1 ring-inset focus-visible:ring-2 focus-visible:outline-none sm:h-64"
            style={{
                backgroundImage: [
                    "linear-gradient(to top, oklch(0 0 0), transparent)",
                    `linear-gradient(to right, oklch(1 0 0), hsl(${hue} 100% 50%))`,
                ].join(", "),
            }}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_oklch(0_0_0/0.55)]"
                style={{ left: `${saturation}%`, top: `${100 - value}%` }}
            />
        </div>
    );
}
