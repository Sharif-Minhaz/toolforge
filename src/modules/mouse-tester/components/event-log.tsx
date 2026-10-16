"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { LogEntry } from "../types";

/**
 * Newest first, timed from the session's first event rather than by the wall
 * clock: "12.345 s" is what a reader comparing two presses needs, and it reads
 * the same in every time zone.
 *
 * Not a live region. A scroll wheel writes a line per notch, and announcing
 * each would bury everything else a screen reader has to say; the current
 * action above the tiles is the one that speaks.
 */
export function EventLog({ entries }: { entries: readonly LogEntry[] }) {
    const t = useTranslations("mouseTester.log");
    const tButtons = useTranslations("mouseTester.buttons");
    const tFaults = useTranslations("mouseTester.faults");
    const formatter = useFormatter();

    function describe(entry: LogEntry): string {
        switch (entry.kind) {
            case "wheel":
                return t(`wheel.${entry.control}`);
            case "press":
                return t("press", { button: tButtons(entry.control) });
            case "release":
                return t("release", {
                    button: tButtons(entry.control),
                    seconds: formatter.number(entry.hold / 1000, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    }),
                });
            case "key":
                return t("key", { code: entry.code });
        }
    }

    if (entries.length === 0) {
        return (
            <p className="bg-muted/30 ring-border/60 text-muted-foreground grid h-72 place-items-center rounded-xl p-4 text-center text-[0.8125rem] ring-1 ring-inset">
                {t("empty")}
            </p>
        );
    }

    return (
        <ol
            aria-label={t("label")}
            tabIndex={0}
            className="bg-muted/30 ring-border/60 focus-visible:ring-ring h-72 overflow-y-auto rounded-xl py-1 font-mono text-[0.75rem] ring-1 outline-none ring-inset focus-visible:ring-2"
        >
            {entries.map((entry) => (
                <li
                    key={entry.id}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1",
                        entry.fault !== null && "bg-destructive/8",
                    )}
                >
                    <span className="min-w-0 flex-1 truncate">{describe(entry)}</span>
                    {entry.fault !== null && (
                        <span className="text-destructive shrink-0 text-[0.6875rem] font-semibold">
                            {tFaults(entry.fault)}
                        </span>
                    )}
                    {entry.kind === "press" && entry.interval !== null && (
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                            {t("interval", { value: formatter.number(Math.round(entry.interval)) })}
                        </span>
                    )}
                    <span className="text-muted-foreground/80 w-20 shrink-0 text-right tabular-nums">
                        {t("at", {
                            seconds: formatter.number(entry.at / 1000, {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                            }),
                        })}
                    </span>
                </li>
            ))}
        </ol>
    );
}
