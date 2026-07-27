"use client";

import { useTranslations } from "next-intl";

import type { MarkdownStatistics } from "../types";

type DocumentStatsProps = {
    statistics: MarkdownStatistics;
};

/**
 * The status line under the panes. Every figure reads as prose, so each message
 * carries an ICU `{value, number}` argument and Bangla renders Bengali numerals
 * without the component knowing anything about it.
 */
export function DocumentStats({ statistics }: DocumentStatsProps) {
    const t = useTranslations("markdown.workbench");

    const entries = [
        { key: "words", label: t("statWords", { value: statistics.words }) },
        { key: "characters", label: t("statCharacters", { value: statistics.characters }) },
        {
            key: "charactersNoSpaces",
            label: t("statCharactersNoSpaces", { value: statistics.charactersNoSpaces }),
        },
        { key: "lines", label: t("statLines", { value: statistics.lines }) },
        {
            key: "reading",
            label:
                statistics.readingMinutes === 0
                    ? t("statReadingEmpty")
                    : t("statReading", { value: statistics.readingMinutes }),
        },
    ] as const;

    return (
        <ul
            role="status"
            className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] tabular-nums"
        >
            {entries.map((entry) => (
                <li key={entry.key} className="leading-[1.4]">
                    {entry.label}
                </li>
            ))}
        </ul>
    );
}
