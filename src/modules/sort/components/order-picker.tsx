"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { SORT_ORDERS, type SortOrder } from "../types";

type OrderPickerProps = {
    value: SortOrder;
    labelId: string;
    onChange: (order: SortOrder) => void;
};

/**
 * The order, as five chips rather than a dropdown.
 *
 * It is the one control a reader changes more than once in a sitting — try
 * ascending, look, try length, look again — and a dropdown makes that two
 * clicks and a hidden list each time. Everything else on the panel is chosen
 * once and left alone, which is what a `Select` is for.
 */
export function OrderPicker({ value, labelId, onChange }: OrderPickerProps) {
    const t = useTranslations("sort.orders");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
        >
            {SORT_ORDERS.map((order) => {
                const selected = order === value;

                return (
                    <button
                        key={order}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(order)}
                        className={cn(
                            "relative flex min-w-0 cursor-pointer items-center rounded-xl px-3 py-2",
                            "ring-1 transition-colors duration-200 outline-none ring-inset",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "ring-transparent"
                                : "bg-card/60 ring-border/70 hover:bg-card hover:ring-border",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="sort-order-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                aria-hidden="true"
                                className="bg-primary/10 ring-primary/45 absolute inset-0 rounded-xl ring-1 ring-inset"
                            />
                        )}

                        <span
                            className={cn(
                                "relative w-full truncate text-left text-[0.8125rem] leading-[1.3] font-medium",
                                selected ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {t(order)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
