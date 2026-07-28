"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { relativeLuminance } from "../domain/contrast";
import type { ColorScaleStop } from "../types";

type ColorScaleStripProps = {
    stops: readonly ColorScaleStop[];
    /** The step whose copy button is currently showing a check. */
    copied: string | null;
    onCopy: (stop: ColorScaleStop) => void;
};

/** Black or white, whichever the swatch can actually be read against. */
function labelColor(stop: ColorScaleStop): string {
    return relativeLuminance(stop.rgb) > 0.35 ? "#000000" : "#ffffff";
}

/**
 * A Tailwind-shaped 50→950 ladder built from the picked colour, each rung
 * copyable on its own.
 */
export function ColorScaleStrip({ stops, copied, onCopy }: ColorScaleStripProps) {
    const t = useTranslations("color.scale");

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <h3 className="text-[0.9375rem] font-medium tracking-tight">{t("title")}</h3>
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                    {t("description")}
                </p>
            </div>

            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {stops.map((stop) => (
                    <li key={stop.step} className="min-w-0">
                        <button
                            type="button"
                            onClick={() => onCopy(stop)}
                            className={cn(
                                "focus-visible:ring-ring flex h-16 w-full flex-col justify-between rounded-lg p-2 text-left ring-1 ring-black/10 transition-transform duration-200 ring-inset hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none",
                                stop.isBase && "ring-2 ring-[var(--tool-accent)]",
                            )}
                            style={{ background: stop.hex, color: labelColor(stop) }}
                            aria-label={t("copy", { step: stop.step, hex: stop.hex })}
                        >
                            <span className="text-[0.6875rem] font-semibold tabular-nums">
                                {stop.step}
                            </span>
                            <span className="truncate font-mono text-[0.625rem]">
                                {copied === stop.step ? t("copied") : stop.hex}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
