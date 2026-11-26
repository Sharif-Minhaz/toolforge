"use client";

import { useFormatter, useTranslations } from "next-intl";

import { mbpsFractionDigits, splitDuration } from "../domain/analysis";

/** Rate, latency and duration formatting for the active locale, Bengali digits included. */
export function useRateFormat() {
    const t = useTranslations("speedTest.workbench");
    const formatter = useFormatter();

    return {
        mbps(bps: number | null | undefined): string {
            return bps === null || bps === undefined
                ? t("notMeasured")
                : formatter.number(bps / 1_000_000, {
                      maximumFractionDigits: mbpsFractionDigits(bps),
                  });
        },
        ms(value: number | null | undefined): string {
            return value === null || value === undefined
                ? t("notMeasured")
                : formatter.number(value, { maximumFractionDigits: value < 10 ? 1 : 0 });
        },
        duration(seconds: number | null): string {
            if (seconds === null) {
                return t("notMeasured");
            }

            const parts = splitDuration(seconds);
            const hours = formatter.number(parts.hours);
            const minutes = formatter.number(parts.minutes);
            const remainder = formatter.number(parts.seconds);

            return parts.hours > 0
                ? t("durationHours", { hours, minutes })
                : parts.minutes > 0
                  ? t("durationMinutes", { minutes, seconds: remainder })
                  : t("durationSeconds", { seconds: remainder });
        },
        hour(hour: number): string {
            return formatter.number(hour, { minimumIntegerDigits: 2 });
        },
    };
}
