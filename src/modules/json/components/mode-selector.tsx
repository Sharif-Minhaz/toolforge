"use client";

import { IconArrowsMinimize, IconCircleCheck, IconIndentIncrease } from "@tabler/icons-react";
import type { IconProps } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { JSON_MODES, type JsonMode } from "../types";

const MODE_ICONS: Record<JsonMode, ComponentType<IconProps>> = {
    beautify: IconIndentIncrease,
    minify: IconArrowsMinimize,
    validate: IconCircleCheck,
};

type ModeSelectorProps = {
    value: JsonMode;
    onChange: (mode: JsonMode) => void;
    labelId: string;
};

export function ModeSelector({ value, onChange, labelId }: ModeSelectorProps) {
    const t = useTranslations("json.workbench");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 grid grid-cols-3 gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {JSON_MODES.map((mode) => {
                const selected = mode === value;
                const Icon = MODE_ICONS[mode];

                return (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(mode)}
                        className={cn(
                            "relative flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium",
                            "transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-2",
                            selected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId="json-mode-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        {/* Three labels plus icons do not fit a 390px row, and
                            Bangla runs wider than English. The icon is the part
                            that carries no information, so it goes first. */}
                        <Icon
                            className="relative hidden size-4 shrink-0 sm:block"
                            stroke={1.8}
                            aria-hidden="true"
                        />
                        <span className="relative truncate leading-[1.3]">
                            {t(`modes.${mode}`)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
