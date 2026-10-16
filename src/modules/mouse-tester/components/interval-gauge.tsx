"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Where the last press-to-press time falls against the fault window: red below
 * it, amber just above where a fast human can still land, green beyond. The
 * scale is four windows wide, so the bands move with the slider and the marker
 * always means the same thing relative to them.
 */

/** The amber band runs from the window to this multiple of it. */
const CAUTION_FACTOR = 1.6;

const SCALE_FACTOR = 4;

type IntervalGaugeProps = {
    interval: number | null;
    faultWindowMs: number;
};

export function IntervalGauge({ interval, faultWindowMs }: IntervalGaugeProps) {
    const t = useTranslations("mouseTester.workbench");
    const formatter = useFormatter();

    const scale = faultWindowMs * SCALE_FACTOR;
    const position = interval === null ? null : Math.min(1, interval / scale);
    const band =
        interval === null
            ? null
            : interval < faultWindowMs
              ? "fault"
              : interval < faultWindowMs * CAUTION_FACTOR
                ? "fast"
                : "normal";

    return (
        <div className="ring-border/60 flex flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <div className="flex items-center justify-between gap-2 text-[0.75rem]">
                <span className="text-muted-foreground">{t("lastInterval")}</span>
                <span
                    className={cn(
                        "font-mono font-medium tabular-nums",
                        band === "fault" && "text-destructive",
                    )}
                >
                    {interval === null
                        ? "—"
                        : t("intervalReading", {
                              value: formatter.number(Math.round(interval)),
                              band: band ?? "normal",
                          })}
                </span>
            </div>

            <div className="relative h-2" aria-hidden="true">
                <div className="absolute inset-0 flex overflow-hidden rounded-full">
                    <div
                        className="bg-destructive/80"
                        style={{ width: `${100 / SCALE_FACTOR}%` }}
                    />
                    <div
                        className="bg-syntax-number/80"
                        style={{ width: `${((CAUTION_FACTOR - 1) * 100) / SCALE_FACTOR}%` }}
                    />
                    <div className="bg-success/80 flex-1" />
                </div>
                {position !== null && (
                    <div
                        className="bg-foreground ring-background absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full ring-2"
                        style={{ left: `${position * 100}%` }}
                    />
                )}
            </div>

            <div className="text-muted-foreground flex justify-between font-mono text-[0.625rem] tabular-nums">
                <span>{t("ms", { value: formatter.number(0) })}</span>
                <span>{t("ms", { value: formatter.number(faultWindowMs) })}</span>
                <span>{t("ms", { value: formatter.number(scale) })}+</span>
            </div>
        </div>
    );
}
