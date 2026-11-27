"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type LimitFieldProps = {
    id: string;
    label: string;
    value: string;
    presets: readonly number[];
    presetsLabel: string;
    hint: string;
    error: string | null;
    formatPreset: (years: number) => string;
    onChange: (value: string) => void;
    /** A preset is a deliberate pick, so the owner applies it without waiting. */
    onPreset: (value: string) => void;
};

/**
 * One side of an age limit. Blank means "not checked", so this is a plain box
 * rather than a stepper, which would always hold a number. Capped at three
 * characters: two digits is every limit there is.
 */
export function LimitField({
    id,
    label,
    value,
    presets,
    presetsLabel,
    hint,
    error,
    formatPreset,
    onChange,
    onPreset,
}: LimitFieldProps) {
    const hintId = `${id}-hint`;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} className="text-muted-foreground text-xs">
                <span className="leading-[1.3]">{label}</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    id={id}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="—"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={error !== null}
                    aria-describedby={hintId}
                    className="bg-card/70 h-9 w-16 rounded-xl text-center font-mono tabular-nums"
                />
                <div role="group" aria-label={presetsLabel} className="flex flex-wrap gap-1">
                    {presets.map((preset) => {
                        const pressed = value.trim() === String(preset);

                        return (
                            <button
                                key={preset}
                                type="button"
                                aria-pressed={pressed}
                                onClick={() => onPreset(pressed ? "" : String(preset))}
                                className={cn(
                                    "h-7 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                    pressed
                                        ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                        : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                                )}
                            >
                                {formatPreset(preset)}
                            </button>
                        );
                    })}
                </div>
            </div>
            <p
                id={hintId}
                className={cn(
                    "text-[0.6875rem] leading-[1.4]",
                    error === null ? "text-muted-foreground" : "text-destructive",
                )}
            >
                {error ?? hint}
            </p>
        </div>
    );
}
