"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const SWAP = {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.6 },
    transition: { duration: 0.16, ease: [0.22, 0.61, 0.36, 1] },
} as const;

type CopyIconSwapProps = {
    copied: boolean;
    className?: string;
};

/** Crossfades the copy glyph into a check without shifting layout. */
export function CopyIconSwap({ copied, className }: CopyIconSwapProps) {
    return (
        <span className={cn("relative grid size-4 place-items-center", className)}>
            <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                    <motion.span
                        key="check"
                        className="absolute inset-0 grid place-items-center"
                        {...SWAP}
                    >
                        <IconCheck className="size-4 text-[var(--color-success)]" stroke={2.4} />
                    </motion.span>
                ) : (
                    <motion.span
                        key="copy"
                        className="absolute inset-0 grid place-items-center"
                        {...SWAP}
                    >
                        <IconCopy className="size-4" stroke={1.8} />
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    );
}

type IconCopyButtonProps = ComponentProps<"button"> & {
    copied: boolean;
};

/**
 * Stateless on purpose — the owning list tracks which row was copied, so a
 * 500-row batch does not mount 500 stateful buttons.
 */
export function IconCopyButton({ copied, className, ...props }: IconCopyButtonProps) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                "text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg",
                "hover:bg-muted hover:text-foreground transition-colors duration-200",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                className,
            )}
        >
            <CopyIconSwap copied={copied} />
        </button>
    );
}
