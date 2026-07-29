"use client";

import { IconAlertTriangle, IconClockPause } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { getTimeZoneCity } from "@/modules/tools/domain/time-zones";
import { formatRunLabel, formatWallClock, getCountdown } from "../domain/format";
import type { CronScheduleResult } from "../types";

type NextRunsPanelProps = {
    schedule: CronScheduleResult;
    timeZone: string;
    nowMs: number;
    pending: boolean;
    copiedField: string | null;
    onCopy: (field: string, value: string) => void;
};

/**
 * The answer most people came for. Each row carries the reading in the reader's
 * own language and, underneath, the bare wall clock — the one you paste into a
 * runbook, which is why it keeps Western digits in both locales.
 */
export function NextRunsPanel({
    schedule,
    timeZone,
    nowMs,
    pending,
    copiedField,
    onCopy,
}: NextRunsPanelProps) {
    const t = useTranslations("cron.workbench");
    const locale = useLocale();

    if (schedule.runs.length === 0) {
        return (
            <p
                role="status"
                className="text-muted-foreground bg-muted/40 ring-border/70 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-normal ring-1 ring-inset"
            >
                <IconClockPause
                    className="mt-0.5 size-4 shrink-0"
                    stroke={1.8}
                    aria-hidden="true"
                />
                <span>{t("neverRuns")}</span>
            </p>
        );
    }

    const countdown = getCountdown(nowMs, schedule.runs[0]);

    return (
        <div
            className={cn(
                "flex flex-col gap-2 transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            <ol className="flex flex-col gap-1.5">
                {schedule.runs.map((epochMs, index) => {
                    const wallClock = formatWallClock(epochMs, timeZone);

                    return (
                        <li
                            key={epochMs}
                            className="bg-card/60 ring-border/70 flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset"
                        >
                            <span className="text-muted-foreground w-6 shrink-0 text-right font-mono text-xs tabular-nums">
                                {index + 1}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate text-[0.8125rem] leading-[1.4] font-medium">
                                    {formatRunLabel(epochMs, timeZone, locale)}
                                </span>
                                <span className="text-muted-foreground truncate font-mono text-[0.6875rem] leading-[1.4]">
                                    {wallClock}
                                </span>
                            </span>
                            {index === 0 && (
                                <span className="bg-primary/10 text-primary ring-primary/20 hidden shrink-0 rounded-lg px-2 py-1 text-[0.6875rem] leading-[1.3] font-medium ring-1 ring-inset sm:inline">
                                    {countdown.days > 0
                                        ? t("inDays", { ...countdown })
                                        : countdown.hours > 0
                                          ? t("inHours", { ...countdown })
                                          : t("inMinutes", { ...countdown })}
                                </span>
                            )}
                            <IconCopyButton
                                copied={copiedField === `run-${epochMs}`}
                                aria-label={t("copyRun")}
                                onClick={() => onCopy(`run-${epochMs}`, wallClock)}
                            />
                        </li>
                    );
                })}
            </ol>

            <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                {t("runsZoneNote", { zone: getTimeZoneCity(timeZone) })}
            </p>

            {schedule.skipped > 0 && (
                <p
                    role="status"
                    className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal"
                >
                    <IconAlertTriangle
                        className="mt-px size-3.5 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    <span>{t("skippedByDst", { count: schedule.skipped })}</span>
                </p>
            )}

            {schedule.exhausted && (
                <p role="status" className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("scheduleExhausted")}
                </p>
            )}
        </div>
    );
}
