"use client";

import { IconTrash } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hourlyMedians, peakSlowdown } from "../domain/history";
import type { SpeedRun } from "../types";
import { useRateFormat } from "./use-rate-format";

/** Recent runs listed under the chart. */
const RECENT_RUNS = 8;

type SpeedHistoryProps = {
    runs: readonly SpeedRun[];
    onClear: () => void;
};

/**
 * Every kept run, by hour of day, in the reader's own zone. This renders only
 * from the stored list, which is empty on the server and in the hydration
 * pass, so reading the local hour here never disagrees with the server.
 */
export function SpeedHistory({ runs, onClear }: SpeedHistoryProps) {
    const t = useTranslations("speedTest.workbench");
    const formatter = useFormatter();
    const format = useRateFormat();

    if (runs.length === 0) {
        return <p className="text-muted-foreground text-xs leading-[1.5]">{t("historyEmpty")}</p>;
    }

    const buckets = hourlyMedians(runs, (at) => new Date(at).getHours());
    const slowdown = peakSlowdown(buckets);
    const fastest = Math.max(...buckets.map((bucket) => bucket.medianDownloadBps ?? 0));

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                    {t("hourChartTitle")}
                </h3>
                <ol className="flex h-28 items-end gap-0.5 sm:gap-1">
                    {buckets.map((bucket) => {
                        const label =
                            bucket.medianDownloadBps === null
                                ? t("hourEmpty", { hour: format.hour(bucket.hour) })
                                : t("hourBar", {
                                      hour: format.hour(bucket.hour),
                                      speed: format.mbps(bucket.medianDownloadBps),
                                      runs: bucket.runs,
                                  });
                        const height =
                            bucket.medianDownloadBps === null || fastest === 0
                                ? 0
                                : Math.max(4, (bucket.medianDownloadBps / fastest) * 100);

                        return (
                            <li
                                key={bucket.hour}
                                aria-label={label}
                                title={label}
                                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                            >
                                <span
                                    className={cn(
                                        "block w-full rounded-t-sm",
                                        height === 0 ? "bg-muted h-1" : "bg-primary/70",
                                        slowdown?.slowestHour === bucket.hour &&
                                            "bg-destructive/70",
                                    )}
                                    style={height === 0 ? undefined : { height: `${height}%` }}
                                />
                            </li>
                        );
                    })}
                </ol>
                <div
                    aria-hidden="true"
                    className="text-muted-foreground flex justify-between font-mono text-[0.625rem] tabular-nums"
                >
                    <span>{format.hour(0)}</span>
                    <span>{format.hour(6)}</span>
                    <span>{format.hour(12)}</span>
                    <span>{format.hour(18)}</span>
                    <span>{format.hour(23)}</span>
                </div>
                <p className="text-xs leading-[1.5]">
                    {slowdown === null || slowdown.ratio >= 1
                        ? t("peakNeedsMore")
                        : t("peakSlowdown", {
                              percent: formatter.number(1 - slowdown.ratio, {
                                  style: "percent",
                                  maximumFractionDigits: 0,
                              }),
                              slow: format.hour(slowdown.slowestHour),
                              fast: format.hour(slowdown.fastestHour),
                          })}
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-muted-foreground text-xs leading-[1.3] font-medium">
                        {t("recentTitle")}
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                        <IconTrash className="size-3.5" stroke={1.9} aria-hidden="true" />
                        {t("clearHistory")}
                    </Button>
                </div>
                <ul className="flex flex-col gap-1">
                    {runs.slice(0, RECENT_RUNS).map((run) => (
                        <li
                            key={run.at}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
                        >
                            <span className="text-muted-foreground">
                                {formatter.dateTime(new Date(run.at), {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })}
                            </span>
                            <span className="font-mono tabular-nums">
                                {t("recentDown", {
                                    value: `${format.mbps(run.downloadBps)} ${t("mbps")}`,
                                })}
                                {" · "}
                                {t("recentUp", {
                                    value: `${format.mbps(run.uploadBps)} ${t("mbps")}`,
                                })}
                                {" · "}
                                {`${format.ms(run.latencyMs)} ${t("ms")}`}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
