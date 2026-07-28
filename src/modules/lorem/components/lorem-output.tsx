"use client";

import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";

import { MOTION_EASE } from "@/components/motion/motion-tokens";
import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { LoremStats } from "../types";

type LoremOutputProps = {
    blocks: readonly string[];
    /** BCP-47 tag of the corpus, so Bangla picks up its own font stack. */
    lang: string;
    /** HTML output reads as code; prose reads as prose. */
    monospace: boolean;
    stats: LoremStats;
    /** Bumped on every generation so the panel can replay its entrance. */
    generationId: number;
    copiedKey: string | null;
    onCopy: (block: string, index: number) => void;
};

export function LoremOutput({
    blocks,
    lang,
    monospace,
    stats,
    generationId,
    copiedKey,
    onCopy,
}: LoremOutputProps) {
    const t = useTranslations("lorem.workbench");
    const format = useFormatter();
    const reduceMotion = useReducedMotion();

    const entrance = reduceMotion
        ? undefined
        : {
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.22, ease: MOTION_EASE },
          };

    return (
        <section aria-label={t("resultsLabel")} className="flex min-w-0 flex-col gap-2">
            <p aria-live="polite" className="sr-only">
                {t("srAnnouncement", {
                    words: format.number(stats.words),
                    paragraphs: format.number(stats.paragraphs),
                })}
            </p>

            <motion.div
                key={generationId}
                {...entrance}
                className="ring-border/80 min-w-0 overflow-hidden rounded-xl ring-1 ring-inset"
            >
                <ul className="divide-border/60 scroll-fade-b max-h-112 divide-y overflow-y-auto">
                    {blocks.map((block, index) => (
                        <li
                            key={`${generationId}-${index}`}
                            className="group/row bg-card hover:bg-muted/60 flex items-start gap-3 px-3 py-3 transition-colors duration-150 sm:px-4"
                        >
                            <span
                                aria-hidden="true"
                                className="text-muted-foreground/70 mt-1 w-5 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums"
                            >
                                {index + 1}
                            </span>
                            <p
                                lang={lang}
                                className={cn(
                                    "min-w-0 flex-1 break-words whitespace-pre-wrap select-all",
                                    monospace
                                        ? "font-mono text-[0.8125rem] leading-6"
                                        : "text-[0.9375rem] leading-7",
                                )}
                            >
                                {block}
                            </p>
                            <IconCopyButton
                                copied={copiedKey === String(index)}
                                onClick={() => onCopy(block, index)}
                                aria-label={t("copyParagraph")}
                                className={cn(
                                    // Always reachable on touch; only fades in
                                    // where a pointer actually exists.
                                    "mt-0.5 transition-opacity duration-150 [@media(hover:hover)]:opacity-0",
                                    "focus-visible:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
                                    copiedKey === String(index) && "opacity-100",
                                )}
                            />
                        </li>
                    ))}
                </ul>
            </motion.div>
        </section>
    );
}
