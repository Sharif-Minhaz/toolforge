"use client";

import type { IconProps } from "@tabler/icons-react";
import { motion } from "motion/react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
    readonly value: T;
    readonly label: string;
    readonly Icon?: ComponentType<IconProps>;
};

type SegmentedControlProps<T extends string> = {
    options: readonly SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    labelId: string;
    /** Unique per instance, so two controls on one page do not share an indicator. */
    layoutId: string;
    size?: "default" | "sm";
};

/**
 * A radio group drawn as one pill with a sliding indicator — the mode switch
 * and the convert side's calendar switch.
 */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    labelId,
    layoutId,
    size = "default",
}: SegmentedControlProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
            className="bg-muted/70 ring-border/60 grid gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {options.map(({ value: option, label, Icon }) => {
                const selected = option === value;

                return (
                    <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option)}
                        className={cn(
                            "relative flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 font-medium",
                            "transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            size === "default" ? "h-10 text-sm" : "h-8 text-[0.8125rem]",
                            selected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId={layoutId}
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        {Icon !== undefined && (
                            <Icon
                                className="relative size-4 shrink-0"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                        )}
                        <span className="relative truncate leading-[1.3]">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
