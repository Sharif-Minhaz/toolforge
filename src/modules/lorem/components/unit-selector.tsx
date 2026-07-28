"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { LOREM_UNITS, type LoremUnit } from "../types";

type UnitSelectorProps = {
    value: LoremUnit;
    onChange: (unit: LoremUnit) => void;
    labelId: string;
};

/** What the amount counts. Four mutually exclusive readings of one number. */
export function UnitSelector({ value, onChange, labelId }: UnitSelectorProps) {
    const t = useTranslations("lorem.units");

    return (
        <div className="flex flex-col gap-2">
            <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset sm:grid-cols-4"
            >
                {LOREM_UNITS.map((unit) => {
                    const selected = unit === value;

                    return (
                        <button
                            key={unit}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onChange(unit)}
                            className={cn(
                                "relative flex h-9 items-center justify-center rounded-lg px-2 text-[0.8125rem] font-medium",
                                "transition-colors duration-200 outline-none",
                                "focus-visible:ring-ring focus-visible:ring-2",
                                selected
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {selected && (
                                <motion.span
                                    layoutId="lorem-unit-indicator"
                                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                    className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                />
                            )}
                            <span className="relative leading-[1.3]">{t(`${unit}.label`)}</span>
                        </button>
                    );
                })}
            </div>

            <div className="min-h-8">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                        key={value}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="text-muted-foreground text-xs leading-relaxed"
                    >
                        {t(`${value}.description`)}
                    </motion.p>
                </AnimatePresence>
            </div>
        </div>
    );
}
