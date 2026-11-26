"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { BIJOY_DIRECTIONS, type BijoyDirection } from "../types";

type DirectionSelectorProps = {
    value: BijoyDirection;
    onChange: (direction: BijoyDirection) => void;
    labelId: string;
};

/** The two directions as one segmented control, the shape every two-way converter here uses. */
export function DirectionSelector({ value, onChange, labelId }: DirectionSelectorProps) {
    const t = useTranslations("bijoyUnicode.workbench");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {BIJOY_DIRECTIONS.map((direction) => {
                const selected = direction === value;

                return (
                    <button
                        key={direction}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(direction)}
                        className={cn(
                            "relative flex h-10 items-center justify-center rounded-lg px-2 text-sm font-medium",
                            "transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="bijoy-direction-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        <span className="relative truncate leading-[1.3]">
                            {t(`directions.${direction}`)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
