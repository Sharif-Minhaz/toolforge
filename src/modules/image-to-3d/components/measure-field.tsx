"use client";

import { useId, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/**
 * A bounded measurement: drag it, or type the exact number.
 *
 * `NumberStepper` in the shared layer is for bounded *integers* with presets,
 * and every dimension here is a length in millimetres with a tenth-millimetre
 * step. Two controls for one value rather than one, because both questions get
 * asked: "roughly how deep" is a drag, and "exactly 1.6 mm because that is four
 * layers" is a keystroke.
 *
 * The field keeps its own raw text so a half-typed "1." is never rewritten
 * under the caret, and commits only when what is typed parses inside the range.
 * Blur is where an out-of-range value is put back, which is the moment the
 * reader has finished saying what they meant.
 */

type MeasureFieldProps = {
    readonly label: ReactNode;
    readonly hint: ReactNode;
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly disabled?: boolean;
    readonly onChange: (next: number) => void;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function MeasureField({
    label,
    hint,
    value,
    min,
    max,
    step,
    disabled = false,
    onChange,
}: MeasureFieldProps) {
    const inputId = useId();
    const hintId = useId();

    const [raw, setRaw] = useState(String(value));
    const [lastValue, setLastValue] = useState(value);

    // The value can change without this field being touched — a preset, a shared
    // link, another control coercing it — and the text has to follow. Adjusted
    // during render rather than from an effect, which is React's own answer for
    // state derived from a prop and avoids the extra commit an effect costs.
    //
    // Comparing the parsed number rather than the string is what leaves "1.50"
    // alone while the reader is still typing it: that keystroke already reported
    // 1.5 upward, so the value did change, and rewriting the text from it would
    // delete the character under the caret.
    if (value !== lastValue) {
        setLastValue(value);

        if (Number(raw) !== value) {
            setRaw(String(value));
        }
    }

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-55")}>
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                    <span className="leading-[1.3]">{label}</span>
                </Label>
                <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    value={raw}
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    aria-describedby={hintId}
                    className="h-8 w-20 text-right text-xs tabular-nums"
                    onChange={(event) => {
                        setRaw(event.target.value);

                        const parsed = Number(event.target.value);

                        if (
                            event.target.value.trim() !== "" &&
                            Number.isFinite(parsed) &&
                            parsed >= min &&
                            parsed <= max
                        ) {
                            onChange(parsed);
                        }
                    }}
                    onBlur={() => {
                        const parsed = Number(raw);
                        const settled = Number.isFinite(parsed) ? clamp(parsed, min, max) : value;

                        setRaw(String(settled));
                        onChange(settled);
                    }}
                />
            </div>
            <Slider
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                aria-label={typeof label === "string" ? label : undefined}
                aria-describedby={hintId}
                onValueChange={(next) => {
                    const settled = Array.isArray(next) ? next[0] : next;

                    if (typeof settled === "number") {
                        // Rounded to the step's own precision: a slider reports
                        // the position it was dragged to, and floating point
                        // turns 1.5 into 1.5000000000000002 on the way through.
                        onChange(Number(settled.toFixed(step < 1 ? 1 : 0)));
                    }
                }}
            />
            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {hint}
            </p>
        </div>
    );
}
