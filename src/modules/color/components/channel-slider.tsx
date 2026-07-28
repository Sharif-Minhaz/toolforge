"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Light and dark squares, so a partly transparent colour reads as transparent. */
export const CHECKERBOARD =
    "repeating-conic-gradient(oklch(0.72 0 0) 0% 25%, oklch(0.98 0 0) 0% 50%) 50% / 10px 10px";

type ChannelSliderProps = {
    label: string;
    /** Shown beside the label, already localised. */
    readout: string;
    value: number;
    max: number;
    step?: number;
    /** Painted behind the track: the gradient this channel sweeps through. */
    trackImage: string;
    /** Lays the gradient over a checkerboard, for the alpha channel. */
    overCheckerboard?: boolean;
    onChange: (value: number) => void;
};

/**
 * A slider whose track shows the colours it moves between.
 *
 * The vendor `Slider` paints its own track and range fill, so both are made
 * transparent through their `data-slot` hooks and the gradient sits on a layer
 * underneath — the component itself is never edited.
 */
export function ChannelSlider({
    label,
    readout,
    value,
    max,
    step = 1,
    trackImage,
    overCheckerboard = false,
    onChange,
}: ChannelSliderProps) {
    const labelId = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <Label id={labelId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{label}</span>
                </Label>
                <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                    {readout}
                </span>
            </div>

            <div className="relative flex h-5 items-center">
                <span
                    aria-hidden="true"
                    className="ring-border/70 pointer-events-none absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-inset"
                    style={overCheckerboard ? { background: CHECKERBOARD } : undefined}
                >
                    <span className="absolute inset-0" style={{ backgroundImage: trackImage }} />
                </span>

                {/* The value is wrapped in an array on purpose. The vendor
                    component counts thumbs from an array value and falls back to
                    `[min, max]` when handed a bare number — which would render a
                    second, unusable thumb on every channel. */}
                <Slider
                    aria-labelledby={labelId}
                    value={[value]}
                    min={0}
                    max={max}
                    step={step}
                    onValueChange={(next) => {
                        if (Array.isArray(next) && typeof next[0] === "number") {
                            onChange(next[0]);
                        }
                    }}
                    className={cn(
                        "relative",
                        "[&_[data-slot=slider-track]]:h-4 [&_[data-slot=slider-track]]:bg-transparent",
                        "[&_[data-slot=slider-range]]:bg-transparent",
                        "[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2",
                        "[&_[data-slot=slider-thumb]]:shadow-[0_1px_4px_oklch(0_0_0/0.45)]",
                    )}
                />
            </div>
        </div>
    );
}
