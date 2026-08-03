"use client";

import { IconPhotoUp, IconWand, type IconProps } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { BLUR_MODES, type BlurMode } from "../types";

const MODE_ICONS: Record<BlurMode, ComponentType<IconProps>> = {
    encode: IconPhotoUp,
    decode: IconWand,
};

type ModeSelectorProps = {
    value: BlurMode;
    onChange: (mode: BlurMode) => void;
    labelId: string;
};

export function ModeSelector({ value, onChange, labelId }: ModeSelectorProps) {
    const t = useTranslations("blurPlaceholder.modes");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {BLUR_MODES.map((mode) => {
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
                                layoutId="blur-mode-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        <Icon className="relative size-4" stroke={1.8} aria-hidden="true" />
                        <span className="relative leading-[1.3]">{t(mode)}</span>
                    </button>
                );
            })}
        </div>
    );
}
