"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "./copy-button";

type UuidResultsProps = {
    uuids: readonly string[];
    /** Bumped on every generation so the panel can replay its entrance. */
    generationId: number;
    copiedIndex: number | null;
    onCopy: (uuid: string, index: number) => void;
};

export function UuidResults({ uuids, generationId, copiedIndex, onCopy }: UuidResultsProps) {
    const t = useTranslations("uuid.generator");
    const reduceMotion = useReducedMotion();
    const single = uuids.length === 1;

    const entrance = reduceMotion
        ? undefined
        : {
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] as const },
          };

    return (
        <section aria-label={t("resultsLabel")} className="flex flex-col gap-2">
            <p aria-live="polite" className="sr-only">
                {t("srAnnouncement", { count: uuids.length })}
            </p>

            {single ? (
                <motion.div
                    key={generationId}
                    {...entrance}
                    className="group bg-muted/45 ring-border/80 relative flex items-center gap-3 overflow-hidden rounded-xl px-4 py-5 ring-1 ring-inset sm:px-6 sm:py-7"
                >
                    {!reduceMotion && (
                        <span
                            aria-hidden="true"
                            className="via-primary/12 animate-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-linear-to-r from-transparent to-transparent [animation-iteration-count:1]"
                        />
                    )}
                    <code className="relative min-w-0 flex-1 font-mono text-base leading-relaxed tracking-tight break-all select-all sm:text-xl md:text-2xl">
                        {uuids[0]}
                    </code>
                    <IconCopyButton
                        copied={copiedIndex === 0}
                        onClick={() => onCopy(uuids[0], 0)}
                        aria-label={t("copySingle")}
                        className="bg-card ring-border/80 relative size-9 ring-1 ring-inset"
                    />
                </motion.div>
            ) : (
                <motion.div
                    key={generationId}
                    {...entrance}
                    className="ring-border/80 overflow-hidden rounded-xl ring-1 ring-inset"
                >
                    <ul className="divide-border/60 scroll-fade-b max-h-100 divide-y overflow-y-auto">
                        {uuids.map((uuid, index) => (
                            <li
                                key={`${generationId}-${uuid}`}
                                className="group/row bg-card hover:bg-muted/60 flex items-center gap-3 px-3 py-1.5 transition-colors duration-150"
                            >
                                <span
                                    aria-hidden="true"
                                    className="text-muted-foreground/70 w-9 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums"
                                >
                                    {index + 1}
                                </span>
                                <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] select-all">
                                    {uuid}
                                </code>
                                <IconCopyButton
                                    copied={copiedIndex === index}
                                    onClick={() => onCopy(uuid, index)}
                                    aria-label={t("copySingle")}
                                    className={cn(
                                        // Always reachable on touch; only fades in on
                                        // hover where a pointer actually exists.
                                        "transition-opacity duration-150 [@media(hover:hover)]:opacity-0",
                                        "focus-visible:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
                                        copiedIndex === index && "opacity-100",
                                    )}
                                />
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}
        </section>
    );
}
