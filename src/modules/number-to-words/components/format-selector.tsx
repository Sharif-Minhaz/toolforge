"use client";

import { IconCash, IconNumber123, type IconProps } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { NUMBER_FORMATS, type NumberFormat } from "../types";

const FORMAT_ICONS: Record<NumberFormat, ComponentType<IconProps>> = {
    cardinal: IconNumber123,
    currency: IconCash,
};

type FormatSelectorProps = {
    value: NumberFormat;
    onChange: (format: NumberFormat) => void;
    labelId: string;
};

export function FormatSelector({ value, onChange, labelId }: FormatSelectorProps) {
    const t = useTranslations("numberToWords.workbench");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {NUMBER_FORMATS.map((format) => {
                const selected = format === value;
                const Icon = FORMAT_ICONS[format];

                return (
                    <button
                        key={format}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(format)}
                        className={cn(
                            "relative flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium",
                            "transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="number-words-format-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        <Icon className="relative size-4" stroke={1.8} aria-hidden="true" />
                        <span className="relative leading-[1.3]">{t(`formats.${format}`)}</span>
                    </button>
                );
            })}
        </div>
    );
}
