"use client";

import { IconLock, IconLockOpen, type IconProps } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { AES_DIRECTIONS, type AesDirection } from "../types";

const DIRECTION_ICONS: Record<AesDirection, ComponentType<IconProps>> = {
    encrypt: IconLock,
    decrypt: IconLockOpen,
};

type DirectionSelectorProps = {
    value: AesDirection;
    onChange: (direction: AesDirection) => void;
    labelId: string;
};

export function DirectionSelector({ value, onChange, labelId }: DirectionSelectorProps) {
    const t = useTranslations("aes.workbench");

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="bg-muted/70 ring-border/60 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset"
        >
            {AES_DIRECTIONS.map((direction) => {
                const selected = direction === value;
                const Icon = DIRECTION_ICONS[direction];

                return (
                    <button
                        key={direction}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(direction)}
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
                                layoutId="aes-direction-indicator"
                                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                                className="bg-card ring-border absolute inset-0 rounded-lg shadow-[0_1px_2px_oklch(0_0_0/0.08)] ring-1"
                            />
                        )}
                        <Icon className="relative size-4" stroke={1.8} aria-hidden="true" />
                        <span className="relative leading-[1.3]">
                            {t(`directions.${direction}`)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
