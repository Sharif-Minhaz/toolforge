"use client";

import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type NumberFieldProps = {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    presets?: readonly number[];
    /** A stepper, a preset, and a typed digit are all discrete — never debounced. */
    onChange: (value: number) => void;
    /** Rendered under the hint when the current value deserves a caution. */
    warning?: string;
};

/**
 * One stepper for every cost parameter. Values are clamped here rather than
 * validated after the fact, so the workbench can never hold a cost the domain
 * would reject — and the digits stay Western, because they mirror machine input
 * rather than reading as prose.
 */
export function NumberField({
    label,
    hint,
    value,
    min,
    max,
    step = 1,
    presets,
    onChange,
    warning,
}: NumberFieldProps) {
    const t = useTranslations("hash.workbench.options");
    const inputId = useId();
    const hintId = useId();

    function clamp(next: number): number {
        return Math.min(max, Math.max(min, next));
    }

    function handleTyped(raw: string) {
        const parsed = Number.parseInt(raw, 10);

        if (Number.isNaN(parsed)) {
            return;
        }

        onChange(clamp(parsed));
    }

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label
                id={`${inputId}-label`}
                htmlFor={inputId}
                className="text-muted-foreground text-xs"
            >
                <span className="leading-[1.3]">{label}</span>
            </Label>

            <div className="flex flex-wrap items-center gap-2">
                <div className="bg-card ring-input focus-within:ring-ring flex h-9 items-center rounded-xl ring-1 transition-colors duration-200 ring-inset focus-within:ring-2">
                    <button
                        type="button"
                        onClick={() => onChange(clamp(value - step))}
                        disabled={value <= min}
                        aria-label={t("decrease")}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-l-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                    >
                        <IconMinus className="size-3.5" stroke={2.2} aria-hidden="true" />
                    </button>
                    <input
                        id={inputId}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        // The widest value this accepts, plus two digits of
                        // overshoot so `clamp` has something to report.
                        maxLength={String(max).length + 2}
                        value={value}
                        onChange={(event) => handleTyped(event.target.value)}
                        aria-describedby={hintId}
                        className="border-border/70 h-9 w-20 border-x bg-transparent text-center font-mono text-sm tabular-nums outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => onChange(clamp(value + step))}
                        disabled={value >= max}
                        aria-label={t("increase")}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-r-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                    >
                        <IconPlus className="size-3.5" stroke={2.2} aria-hidden="true" />
                    </button>
                </div>

                {presets !== undefined && (
                    <div
                        role="group"
                        aria-label={t("presets")}
                        className="flex flex-wrap items-center gap-1"
                    >
                        {presets.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                aria-pressed={value === preset}
                                onClick={() => onChange(clamp(preset))}
                                className={cn(
                                    "h-7 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                    value === preset
                                        ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                        : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                                )}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <p id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {hint}
            </p>

            {warning !== undefined && (
                <p className="text-brand-amber text-[0.6875rem] leading-[1.4]">{warning}</p>
            )}
        </div>
    );
}
