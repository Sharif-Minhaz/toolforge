"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { UUID_VERSIONS, type UuidVersion } from "../types";

type VersionSelectorProps = {
    value: UuidVersion;
    onChange: (version: UuidVersion) => void;
    labelId: string;
};

export function VersionSelector({ value, onChange, labelId }: VersionSelectorProps) {
    const t = useTranslations("uuid.versions");

    return (
        <div className="flex flex-col gap-2">
            <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="bg-muted/70 ring-border/60 grid grid-cols-3 gap-1 rounded-xl p-1 ring-1 ring-inset"
            >
                {UUID_VERSIONS.map((version) => {
                    const selected = version === value;

                    return (
                        <button
                            key={version}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onChange(version)}
                            className={cn(
                                "relative flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium",
                                "transition-colors duration-200 outline-none",
                                "focus-visible:ring-ring focus-visible:ring-2",
                                selected
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {selected && (
                                <motion.span
                                    layoutId="uuid-version-indicator"
                                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                    className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                                />
                            )}
                            <span className="relative font-mono text-[0.8125rem] tracking-tight">
                                {t(`v${version}.short`)}
                            </span>
                            <span className="text-muted-foreground relative hidden text-xs font-normal sm:inline">
                                {t(`v${version}.tagline`)}
                            </span>
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
                        {t(`v${value}.description`)}
                    </motion.p>
                </AnimatePresence>
            </div>
        </div>
    );
}
