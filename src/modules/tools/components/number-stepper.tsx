"use client";

import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A bounded integer field with steppers and one-tap presets.
 *
 * Every label arrives as a prop rather than being read from a namespace, so a
 * tool can reuse the control without inheriting another tool's copy. Presets
 * and the field itself keep Western digits: the number mirrors machine input
 * rather than reading as prose.
 */

type NumberStepperProps = {
    /** Raw field text, so a half-typed value is never rewritten under the caret. */
    value: string;
    /** Last value that parsed inside the range; drives the preset highlight. */
    numeric: number;
    min: number;
    max: number;
    presets: readonly number[];
    invalid: boolean;
    disabled?: boolean;
    inputId: string;
    describedById: string;
    hint: ReactNode;
    presetsLabel: string;
    decreaseLabel: string;
    increaseLabel: string;
    /** Fires per keystroke — the owner debounces before recomputing. */
    onChange: (raw: string) => void;
    /** A deliberate pick, so the owner acts straight away. */
    onPreset: (preset: number) => void;
    onStep: (delta: number) => void;
};

export function NumberStepper({
    value,
    numeric,
    min,
    max,
    presets,
    invalid,
    disabled = false,
    inputId,
    describedById,
    hint,
    presetsLabel,
    decreaseLabel,
    increaseLabel,
    onChange,
    onPreset,
    onStep,
}: NumberStepperProps) {
    const digits = String(max).length;

    return (
        <div
            className={cn(
                "flex flex-col gap-2 transition-opacity duration-200",
                disabled && "opacity-55",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <div
                    className={cn(
                        "bg-card flex h-9 items-center rounded-xl ring-1 transition-colors duration-200 ring-inset",
                        invalid && !disabled
                            ? "ring-destructive"
                            : "ring-input focus-within:ring-ring focus-within:ring-2",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => onStep(-1)}
                        disabled={disabled || numeric <= min}
                        aria-label={decreaseLabel}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-l-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                    >
                        <IconMinus className="size-3.5" stroke={2.2} aria-hidden="true" />
                    </button>
                    <input
                        id={inputId}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        // The widest number this accepts, plus room to overshoot
                        // by two digits — enough for the field to go invalid and
                        // say so, and far short of a paste worth parsing.
                        maxLength={digits + 2}
                        value={value}
                        disabled={disabled}
                        onChange={(event) => onChange(event.target.value)}
                        aria-invalid={invalid && !disabled}
                        aria-describedby={describedById}
                        style={{ width: `${digits + 2}ch` }}
                        className="border-border/70 h-9 min-w-14 border-x bg-transparent text-center font-mono text-sm tabular-nums outline-none disabled:pointer-events-none"
                    />
                    <button
                        type="button"
                        onClick={() => onStep(1)}
                        disabled={disabled || numeric >= max}
                        aria-label={increaseLabel}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-r-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                    >
                        <IconPlus className="size-3.5" stroke={2.2} aria-hidden="true" />
                    </button>
                </div>

                <div
                    role="group"
                    aria-label={presetsLabel}
                    className="flex flex-wrap items-center gap-1"
                >
                    {presets.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            disabled={disabled}
                            aria-pressed={numeric === preset}
                            onClick={() => onPreset(preset)}
                            className={cn(
                                "h-7 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                "disabled:pointer-events-none",
                                numeric === preset
                                    ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                    : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                            )}
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>

            <p
                id={describedById}
                className={cn(
                    "text-xs leading-[1.4]",
                    invalid && !disabled ? "text-destructive" : "text-muted-foreground",
                )}
            >
                {hint}
            </p>
        </div>
    );
}
