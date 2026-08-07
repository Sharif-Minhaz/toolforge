"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
    DEFAULT_PBKDF2_ITERATIONS,
    MAX_PBKDF2_ITERATIONS,
    MIN_PBKDF2_ITERATIONS,
    PBKDF2_ITERATION_PRESETS,
    PBKDF2_ITERATION_STEP,
    SLOW_PBKDF2_ITERATIONS,
} from "../domain/constants";

/**
 * The PBKDF2 work factor.
 *
 * Deliberately not the Hash tool's `NumberField`, which is a stepper: one
 * iteration either way is meaningless here, and the useful gesture is dragging
 * across two orders of magnitude. Generalising that component would mean
 * injecting a variant, a step scale and its translation namespace — three
 * parameters to remove a duplication that is four lines of clamping.
 *
 * The slider is the coarse control and the box is the exact one. Both are
 * discrete actions, so neither is debounced.
 */

type IterationFieldProps = {
    value: number;
    disabled: boolean;
    onChange: (value: number) => void;
};

function clamp(value: number): number {
    return Math.min(MAX_PBKDF2_ITERATIONS, Math.max(MIN_PBKDF2_ITERATIONS, value));
}

export function IterationField({ value, disabled, onChange }: IterationFieldProps) {
    const t = useTranslations("aes.workbench.advanced");
    const format = useFormatter();
    const inputId = useId();
    const hintId = useId();

    function handleTyped(raw: string) {
        const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);

        if (!Number.isNaN(parsed)) {
            onChange(clamp(parsed));
        }
    }

    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-55")}>
            <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{t("iterationsLabel")}</span>
            </Label>

            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t("iterationsHint", { recommended: DEFAULT_PBKDF2_ITERATIONS })}
            </p>

            <div className="flex flex-wrap items-center gap-3">
                <Slider
                    value={value}
                    min={MIN_PBKDF2_ITERATIONS}
                    max={MAX_PBKDF2_ITERATIONS}
                    step={PBKDF2_ITERATION_STEP}
                    disabled={disabled}
                    aria-label={t("iterationsLabel")}
                    onValueChange={(next) => {
                        if (typeof next === "number") {
                            onChange(clamp(next));
                        }
                    }}
                    className="min-w-40 flex-1"
                />
                <input
                    id={inputId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={String(MAX_PBKDF2_ITERATIONS).length}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => handleTyped(event.target.value)}
                    aria-describedby={hintId}
                    className={cn(
                        "bg-card ring-input focus-within:ring-ring h-9 w-28 shrink-0 rounded-xl px-2.5 ring-1 ring-inset",
                        "text-center font-mono text-sm tabular-nums transition-colors duration-200 outline-none",
                        "focus-visible:ring-2 disabled:pointer-events-none",
                    )}
                />
            </div>

            <div
                role="group"
                aria-label={t("presets")}
                className="flex flex-wrap items-center gap-1"
            >
                {PBKDF2_ITERATION_PRESETS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        aria-pressed={value === preset}
                        disabled={disabled}
                        onClick={() => onChange(preset)}
                        className={cn(
                            "h-7 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            "disabled:pointer-events-none",
                            value === preset
                                ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                        )}
                    >
                        {format.number(preset)}
                    </button>
                ))}
            </div>

            {value >= SLOW_PBKDF2_ITERATIONS && (
                <p className="text-brand-amber text-[0.6875rem] leading-[1.4]">
                    {t("iterationsSlow")}
                </p>
            )}
        </div>
    );
}
