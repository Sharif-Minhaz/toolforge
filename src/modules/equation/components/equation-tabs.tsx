"use client";

import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type EquationTabsProps = {
    count: number;
    active: number;
    labelId: string;
    /** Marks the tabs whose LaTeX has been edited by hand since conversion. */
    edited: readonly boolean[];
    onSelect: (index: number) => void;
};

/**
 * One numbered chip per equation, shown only when there is more than one.
 *
 * A picker rather than a stack of editors. Four equations, each with its own
 * source box and its own rendered preview, is four screens on a phone before
 * the reader has read anything — and the thing they came to do is check *one*
 * equation against *one* preview. The strip keeps every equation one press away
 * and the page one screen tall.
 *
 * The edited marker is a dot rather than a colour, because "you changed this
 * one" has to survive a reader who cannot tell the two hues apart.
 */
export function EquationTabs({ count, active, labelId, edited, onSelect }: EquationTabsProps) {
    const t = useTranslations("equation.workbench");
    const formatter = useFormatter();

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="flex flex-wrap items-center gap-1.5"
        >
            {Array.from({ length: count }, (_, index) => {
                const selected = index === active;

                return (
                    <button
                        key={index}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={t("equationTab", { number: formatter.number(index + 1) })}
                        onClick={() => onSelect(index)}
                        className={cn(
                            "relative flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2.5",
                            "text-[0.8125rem] leading-[1.3] font-medium tabular-nums",
                            "ring-1 transition-colors duration-200 outline-none ring-inset",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "text-foreground ring-transparent"
                                : "text-muted-foreground hover:text-foreground bg-card/60 ring-border/70",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="equation-tab-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                aria-hidden="true"
                                className="bg-primary/10 ring-primary/45 absolute inset-0 rounded-lg ring-1 ring-inset"
                            />
                        )}
                        <span className="relative">{formatter.number(index + 1)}</span>
                        {edited[index] === true && (
                            <span
                                aria-hidden="true"
                                className="bg-brand-amber relative size-1.5 rounded-full"
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
