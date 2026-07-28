"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type RegexStatsProps = {
    matchCount: number;
    groupCount: number;
    durationMs: number;
    truncated: boolean;
    pending: boolean;
};

/**
 * The counters above the pattern.
 *
 * regex101 shows a "Steps" figure here, counted by its own engine. There is no
 * ECMAScript equivalent — `RegExp` reports nothing about the backtracking it
 * did — so inventing a number would be worse than leaving it out. Groups takes
 * that slot instead, and the timing is a real `performance.now()` delta around
 * the match loop.
 */
export function RegexStats({
    matchCount,
    groupCount,
    durationMs,
    truncated,
    pending,
}: RegexStatsProps) {
    const t = useTranslations("regex.workbench");
    const format = useFormatter();

    const stats = [
        {
            key: "matches",
            label: t("statMatches"),
            value: truncated
                ? t("statTruncated", { count: matchCount })
                : format.number(matchCount),
            tone: matchCount > 0 ? "text-foreground" : "text-muted-foreground",
        },
        {
            key: "groups",
            label: t("statGroups"),
            value: format.number(groupCount),
            tone: "text-muted-foreground",
        },
        {
            key: "time",
            label: t("statTime"),
            // Sub-millisecond runs are the common case; one decimal keeps them
            // from all reading as zero.
            value: t("milliseconds", {
                value: format.number(Math.round(durationMs * 10) / 10),
            }),
            tone: "text-muted-foreground",
        },
    ];

    return (
        <ul
            className={cn(
                "flex flex-wrap items-center gap-1.5 transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            {stats.map((stat) => (
                <li
                    key={stat.key}
                    className="bg-muted/60 ring-border/60 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.6875rem] ring-1 ring-inset"
                >
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span aria-hidden="true" className="bg-border/80 h-2.5 w-px" />
                    <span className={cn("font-mono tabular-nums", stat.tone)}>{stat.value}</span>
                </li>
            ))}
        </ul>
    );
}
