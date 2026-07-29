"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { CRON_PRESETS } from "../domain/constants";

type CronPresetsProps = {
    /** The expression currently in the field, so the matching chip can light up. */
    active: string;
    onSelect: (expression: string) => void;
};

/**
 * One-tap examples. The expressions themselves are data and stay identical in
 * both locales — only the label describing each is translated.
 */
export function CronPresets({ active, onSelect }: CronPresetsProps) {
    const t = useTranslations("cron.presets");

    return (
        <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-0.5 text-[0.6875rem] leading-[1.4]">
                {t("label")}
            </span>
            <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-1">
                {CRON_PRESETS.map((preset) => (
                    <button
                        key={preset.key}
                        type="button"
                        aria-pressed={active === preset.expression}
                        onClick={() => onSelect(preset.expression)}
                        className={cn(
                            "h-7 rounded-lg px-2 text-[0.6875rem] leading-[1.4] transition-colors duration-200",
                            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                            active === preset.expression
                                ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                        )}
                    >
                        {t(preset.key)}
                    </button>
                ))}
            </div>
        </div>
    );
}
