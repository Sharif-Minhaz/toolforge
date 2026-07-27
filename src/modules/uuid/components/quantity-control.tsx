"use client";

import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { MAX_UUID_QUANTITY, MIN_UUID_QUANTITY, UUID_QUANTITY_PRESETS } from "../domain/constants";

type QuantityControlProps = {
    value: string;
    quantity: number;
    /** Fires per keystroke — the owner debounces before regenerating. */
    onChange: (raw: string) => void;
    /** A deliberate pick, so the owner regenerates straight away. */
    onPreset: (preset: number) => void;
    onStep: (delta: number) => void;
    invalid: boolean;
    inputId: string;
    describedById: string;
};

export function QuantityControl({
    value,
    quantity,
    onChange,
    onPreset,
    onStep,
    invalid,
    inputId,
    describedById,
}: QuantityControlProps) {
    const t = useTranslations("uuid.generator");
    const tErrors = useTranslations("uuid.errors");

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <div
                    className={cn(
                        "bg-card flex h-9 items-center rounded-xl ring-1 transition-colors duration-200 ring-inset",
                        invalid
                            ? "ring-destructive"
                            : "ring-input focus-within:ring-ring focus-within:ring-2",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => onStep(-1)}
                        disabled={quantity <= MIN_UUID_QUANTITY}
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
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        aria-invalid={invalid}
                        aria-describedby={describedById}
                        className="border-border/70 h-9 w-14 border-x bg-transparent text-center font-mono text-sm tabular-nums outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => onStep(1)}
                        disabled={quantity >= MAX_UUID_QUANTITY}
                        aria-label={t("increase")}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 place-items-center rounded-r-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                    >
                        <IconPlus className="size-3.5" stroke={2.2} aria-hidden="true" />
                    </button>
                </div>

                <div
                    role="group"
                    aria-label={t("quantityPresets")}
                    className="flex flex-wrap items-center gap-1"
                >
                    {UUID_QUANTITY_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            aria-pressed={quantity === preset}
                            onClick={() => onPreset(preset)}
                            className={cn(
                                "h-7 rounded-lg px-2 font-mono text-xs tabular-nums transition-colors duration-200",
                                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                quantity === preset
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
                className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}
            >
                {invalid
                    ? tErrors("quantityRange", {
                          min: MIN_UUID_QUANTITY,
                          max: MAX_UUID_QUANTITY,
                      })
                    : t("quantityHint", { min: MIN_UUID_QUANTITY, max: MAX_UUID_QUANTITY })}
            </p>
        </div>
    );
}
