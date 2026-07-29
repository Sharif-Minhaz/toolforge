import type {
    CronExplanation,
    CronExpression,
    CronField,
    CronQualifier,
    CronTerm,
    CronTimePhrase,
    CronValueItem,
    CronValuePhrase,
} from "../types";
import { MAX_LISTED_TIMES } from "./constants";

/**
 * A parsed schedule, reduced to something a sentence can be built from.
 *
 * Nothing here produces text. The catalogue owns every word, because "every
 * 5 minutes" and "প্রতি ৫ মিনিটে" are the same structure with different
 * grammar — so this returns the structure and the UI supplies the language.
 *
 * The one place it does more than describe each column separately is the time
 * clause. `*​/5 * * * *` has to read as "every 5 minutes"; describing the minute
 * and hour columns one at a time would produce "every 5th minute, every hour",
 * which is accurate, unidiomatic, and how most cron explainers give themselves
 * away.
 */

// A bare star, or a star stepped by one — the same thing said the long way.
function isEvery(field: CronField): boolean {
    const [term] = field.terms;

    return field.terms.length === 1 && term.kind === "all" && term.step === 1;
}

/** The step of a lone `*` or `*​/n`, or `null` if the field is anything else. */
function stepOfAll(field: CronField): number | null {
    const [term] = field.terms;

    return field.terms.length === 1 && term.kind === "all" ? term.step : null;
}

function singleValue(field: CronField): number | null {
    const [term] = field.terms;

    return field.terms.length === 1 && term.kind === "single" ? term.value : null;
}

/** The field's values, but only when no calendar-relative term is in play. */
function listableValues(field: CronField): readonly number[] | null {
    const plain = field.terms.every(
        (term) => term.kind === "all" || term.kind === "single" || term.kind === "range",
    );

    return plain ? field.values : null;
}

function toItem(term: CronTerm): CronValueItem {
    switch (term.kind) {
        case "all":
            return { kind: "everyStep", step: term.step };
        case "single":
            return { kind: "value", value: term.value };
        case "range":
            return term.step === 1
                ? { kind: "range", from: term.from, to: term.to }
                : { kind: "step", from: term.from, to: term.to, step: term.step };
        case "lastDayOfMonth":
            return { kind: "lastDayOfMonth", offset: term.offset };
        case "lastWeekday":
            return { kind: "lastWeekday" };
        case "nearestWeekday":
            return { kind: "nearestWeekday", day: term.day };
        case "lastWeekdayOfMonth":
            return { kind: "lastWeekdayOfMonth", weekday: term.weekday };
        case "nthWeekday":
            return { kind: "nthWeekday", weekday: term.weekday, nth: term.nth };
    }
}

/** One column's reading, used by both the sentence and the breakdown grid. */
export function describeField(field: CronField): CronValuePhrase {
    if (isEvery(field) || field.unspecified) {
        return { kind: "every" };
    }

    return { kind: "items", items: field.terms.map(toItem) };
}

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

/** `04:05`, or `04:05:30` once a seconds column is in play. Western digits:
 *  a clock reading mirrors machine input rather than prose. */
function formatClock(hour: number, minute: number, second: number, withSeconds: boolean): string {
    const base = `${pad2(hour)}:${pad2(minute)}`;

    return withSeconds ? `${base}:${pad2(second)}` : base;
}

function describeTime(expression: CronExpression): CronTimePhrase {
    const { second, minute, hour } = expression.fields;
    const secondStep = stepOfAll(second);

    if (secondStep !== null && isEvery(minute) && isEvery(hour)) {
        return secondStep === 1
            ? { kind: "everySecond" }
            : { kind: "everyNSeconds", step: secondStep };
    }

    const atSecond = singleValue(second);

    // A seconds column doing anything richer than naming one instant has no
    // idiomatic short form, so every column speaks for itself.
    if (atSecond === null) {
        return {
            kind: "atSecondsMinutesHours",
            seconds: describeField(second),
            minutes: describeField(minute),
            hours: describeField(hour),
        };
    }

    // A second that is not the zeroth cannot be folded into any short form, so
    // it either survives in a clock reading or the columns speak separately.
    const withSeconds = expression.hasSeconds && atSecond !== 0;
    const minuteStep = stepOfAll(minute);

    if (minuteStep !== null && !withSeconds) {
        if (isEvery(hour)) {
            return minuteStep === 1
                ? { kind: "everyMinute" }
                : { kind: "everyNMinutes", step: minuteStep };
        }

        return minuteStep === 1
            ? { kind: "everyMinutePastHours", hours: describeField(hour) }
            : { kind: "everyNMinutesPastHours", step: minuteStep, hours: describeField(hour) };
    }

    const minutes = listableValues(minute);
    const hours = listableValues(hour);
    const clockReadings =
        minutes !== null && hours !== null
            ? minutes.length * hours.length
            : Number.POSITIVE_INFINITY;

    if (
        minutes !== null &&
        hours !== null &&
        clockReadings > 0 &&
        clockReadings <= MAX_LISTED_TIMES
    ) {
        return {
            kind: "atTimes",
            times: hours.flatMap((atHour) =>
                minutes.map((atMinute) => formatClock(atHour, atMinute, atSecond, withSeconds)),
            ),
        };
    }

    if (withSeconds) {
        return {
            kind: "atSecondsMinutesHours",
            seconds: describeField(second),
            minutes: describeField(minute),
            hours: describeField(hour),
        };
    }

    // `0 * * * *` — one minute, every hour. Naming 24 clock readings would be
    // accurate and unreadable.
    if (isEvery(hour)) {
        return { kind: "atMinutesOfEveryHour", minutes: describeField(minute) };
    }

    return {
        kind: "atMinutesPastHours",
        minutes: describeField(minute),
        hours: describeField(hour),
    };
}

const QUALIFIER_FIELDS = ["dayOfMonth", "month", "dayOfWeek", "year"] as const;

/** The single reading the explanation panel and the field grid both work from. */
export function explainCron(expression: CronExpression): CronExplanation {
    if (expression.reboot) {
        return { reboot: true, time: { kind: "everyMinute" }, qualifiers: [], dayUnion: false };
    }

    const qualifiers: CronQualifier[] = [];

    for (const name of QUALIFIER_FIELDS) {
        const field = expression.fields[name];

        if (isEvery(field) || field.unspecified) {
            continue;
        }

        qualifiers.push({ field: name, phrase: describeField(field) });
    }

    return {
        reboot: false,
        time: describeTime(expression),
        qualifiers,
        dayUnion: !expression.fields.dayOfMonth.star && !expression.fields.dayOfWeek.star,
    };
}
