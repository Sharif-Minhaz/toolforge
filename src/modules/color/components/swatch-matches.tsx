"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { SwatchMatch } from "../types";

type SwatchMatchesProps = {
    tailwind: SwatchMatch;
    cssName: SwatchMatch;
    pending: boolean;
    onSelect: (match: SwatchMatch) => void;
};

/**
 * The nearest entry in each built-in palette. Both are one click away from
 * becoming the picked colour, which is the fast path from "close enough" to
 * "the token my design system already has".
 */
export function SwatchMatches({ tailwind, cssName, pending, onSelect }: SwatchMatchesProps) {
    const t = useTranslations("color.matches");
    const format = useFormatter();

    const rows = [
        { key: "tailwind", match: tailwind },
        { key: "css", match: cssName },
    ] as const;

    return (
        <ul
            className={cn(
                "grid gap-2 transition-opacity duration-200 sm:grid-cols-2",
                pending && "opacity-55",
            )}
        >
            {rows.map((row) => (
                <li key={row.key} className="min-w-0">
                    <button
                        type="button"
                        onClick={() => onSelect(row.match)}
                        className="bg-card/60 ring-border/70 hover:ring-border focus-visible:ring-ring flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-all duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <span
                            aria-hidden="true"
                            className="size-9 shrink-0 rounded-lg ring-1 ring-black/10 ring-inset"
                            style={{ background: row.match.hex }}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t(`${row.key}.label`)}
                            </span>
                            <span className="truncate font-mono text-[0.8125rem] leading-[1.4] font-medium">
                                {row.match.name}
                            </span>
                            <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {row.match.exact
                                    ? t("exact", { hex: row.match.hex })
                                    : t("approximate", {
                                          hex: row.match.hex,
                                          distance: format.number(
                                              Math.round(row.match.distance * 1000) / 1000,
                                          ),
                                      })}
                            </span>
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}
