"use client";

import { useFormatter, useTranslations } from "next-intl";

import type {
    CronExplanation,
    CronFieldName,
    CronQualifier,
    CronTimePhrase,
    CronValueItem,
    CronValuePhrase,
} from "../types";

/**
 * Turns the domain's reading of a schedule into a sentence.
 *
 * The domain deliberately stops at structure — "every 5 minutes" and
 * "প্রতি ৫ মিনিট অন্তর" are the same shape with different grammar — so this is
 * where the catalogue supplies the words. Every number goes through the
 * formatter, so Bangla renders Bengali numerals, and grouping is off because a
 * year is not "2,027" in any locale.
 */

const MONTH_KEYS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
] as const;

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const ORDINAL_KEYS = ["first", "second", "third", "fourth", "fifth"] as const;

export function useCronSentence() {
    const t = useTranslations("cron.explain");
    const format = useFormatter();

    const number = (value: number) => format.number(value, { useGrouping: false });

    function renderValue(field: CronFieldName, value: number): string {
        if (field === "month") {
            return t(`months.${MONTH_KEYS[value - 1]}`);
        }

        if (field === "dayOfWeek") {
            return t(`weekdays.${WEEKDAY_KEYS[value]}`);
        }

        return number(value);
    }

    function joinParts(parts: readonly string[]): string {
        if (parts.length < 2) {
            return parts[0] ?? "";
        }

        return `${parts.slice(0, -1).join(t("listSeparator"))}${t("listLast")}${parts.at(-1)}`;
    }

    function renderItem(field: CronFieldName, item: CronValueItem): string {
        switch (item.kind) {
            case "value":
                return renderValue(field, item.value);
            case "range":
                return t("item.range", {
                    from: renderValue(field, item.from),
                    to: renderValue(field, item.to),
                });
            case "step":
                return t("item.step", {
                    step: number(item.step),
                    from: renderValue(field, item.from),
                    to: renderValue(field, item.to),
                });
            case "everyStep":
                return t("item.everyStep", { step: number(item.step) });
            case "lastDayOfMonth":
                return item.offset === 0
                    ? t("item.lastDayOfMonth")
                    : t("item.lastDayOfMonthOffset", { offset: number(item.offset) });
            case "lastWeekday":
                return t("item.lastWeekday");
            case "nearestWeekday":
                return t("item.nearestWeekday", { day: number(item.day) });
            case "lastWeekdayOfMonth":
                return t("item.lastWeekdayOfMonth", {
                    weekday: renderValue("dayOfWeek", item.weekday),
                });
            case "nthWeekday":
                return t("item.nthWeekday", {
                    ordinal: t(`ordinals.${ORDINAL_KEYS[item.nth - 1]}`),
                    weekday: renderValue("dayOfWeek", item.weekday),
                });
        }
    }

    function renderPhrase(field: CronFieldName, phrase: CronValuePhrase): string {
        return phrase.kind === "every"
            ? t("everyValue")
            : joinParts(phrase.items.map((item) => renderItem(field, item)));
    }

    function renderTime(time: CronTimePhrase): string {
        switch (time.kind) {
            case "everySecond":
                return t("time.everySecond");
            case "everyNSeconds":
                return t("time.everyNSeconds", { step: number(time.step) });
            case "everyMinute":
                return t("time.everyMinute");
            case "everyNMinutes":
                return t("time.everyNMinutes", { step: number(time.step) });
            case "everyMinutePastHours":
                return t("time.everyMinutePastHours", {
                    hours: renderPhrase("hour", time.hours),
                });
            case "everyNMinutesPastHours":
                return t("time.everyNMinutesPastHours", {
                    step: number(time.step),
                    hours: renderPhrase("hour", time.hours),
                });
            case "atTimes":
                return t("time.atTimes", { times: joinParts(time.times) });
            case "atMinutesOfEveryHour":
                return t("time.atMinutesOfEveryHour", {
                    minutes: renderPhrase("minute", time.minutes),
                });
            case "atMinutesPastHours":
                return t("time.atMinutesPastHours", {
                    minutes: renderPhrase("minute", time.minutes),
                    hours: renderPhrase("hour", time.hours),
                });
            case "atSecondsMinutesHours":
                return t("time.atSecondsMinutesHours", {
                    seconds: renderPhrase("second", time.seconds),
                    minutes: renderPhrase("minute", time.minutes),
                    hours: renderPhrase("hour", time.hours),
                });
        }
    }

    function renderQualifier(qualifier: CronQualifier): string {
        return t(`qualifier.${qualifier.field}`, {
            values: renderPhrase(qualifier.field, qualifier.phrase),
        });
    }

    function renderExplanation(explanation: CronExplanation): string {
        if (explanation.reboot) {
            return t("reboot");
        }

        const clauses = [
            renderTime(explanation.time),
            ...explanation.qualifiers.map(renderQualifier),
        ];

        return t("sentence", { clause: clauses.join(t("listSeparator")) });
    }

    return { renderExplanation, renderPhrase };
}
