"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";

import { getWeekday } from "@/modules/tools/domain/calendar";
import { toBanglaDigits } from "@/modules/tools/domain/bangla-digits";
import { banglaMonthName, formatBanglaDate } from "../domain/bangla-names";
import {
    GREGORIAN_MONTHS,
    HIJRI_MONTHS,
    WEEKDAYS,
    type BanglaDate,
    type CalendarId,
    type CivilDate,
    type HijriDate,
} from "../types";

export type CalendarLabels = {
    /** Western digits on the English page, Bangla digits on the Bangla one — never grouped. */
    digits: (value: number) => string;
    /** A count that reads as prose, grouped: `10,422` / `১০,৪২২`. */
    number: (value: number) => string;
    /** `Tuesday, 12 May 1998`. */
    gregorian: (date: CivilDate) => string;
    /** `12 May 1998`, for the dates inside a sentence. */
    gregorianShort: (date: CivilDate) => string;
    /** Always `২৯ কার্তিক ১৪০৮ বঙ্গাব্দ`, whichever page it is on. */
    bangla: (date: BanglaDate) => string;
    hijri: (date: HijriDate) => string;
    monthName: (calendar: CalendarId, month: number) => string;
};

/**
 * Every date this tool prints, built from the catalogue rather than `Intl`, so
 * the server render and the hydration pass cannot disagree on a month's
 * spelling. Years go through `digits` rather than the number formatter, which
 * would group ১৪৩৩ as ১,৪৩৩.
 */
export function useCalendarLabels(): CalendarLabels {
    const t = useTranslations("ageCalculator");
    const locale = useLocale();
    const formatter = useFormatter();

    const digits = (value: number) =>
        locale === "bn" ? toBanglaDigits(String(value)) : String(value);

    const monthName = (calendar: CalendarId, month: number): string => {
        switch (calendar) {
            case "gregorian":
                return t(`gregorianMonths.${GREGORIAN_MONTHS[month - 1]}`);
            case "bangla":
                // Bangla script on every page; see `domain/bangla-names.ts`.
                return banglaMonthName(month);
            case "hijri":
                return t(`hijriMonths.${HIJRI_MONTHS[month - 1]}`);
        }
    };

    const gregorianShort = (date: CivilDate) =>
        t("workbench.shortDate", {
            day: digits(date.day),
            month: monthName("gregorian", date.month),
            year: digits(date.year),
        });

    return {
        digits,
        number: (value) => formatter.number(value),
        monthName,
        gregorianShort,
        gregorian: (date) =>
            t("workbench.gregorianDate", {
                weekday: t(`weekdays.${WEEKDAYS[getWeekday(date.year, date.month, date.day)]}`),
                day: digits(date.day),
                month: monthName("gregorian", date.month),
                year: digits(date.year),
            }),
        bangla: (date) => formatBanglaDate(date),
        hijri: (date) =>
            t("workbench.hijriDate", {
                day: digits(date.day),
                month: monthName("hijri", date.month),
                year: digits(date.year),
            }),
    };
}
