import { describe, expect, test } from "bun:test";

import { describeField, explainCron } from "@/modules/cron/domain/describe";
import { parseCron } from "@/modules/cron/domain/parse";
import type { CronExplanation, CronFieldName, CronWeekdayBase } from "@/modules/cron/types";

function explain(expression: string, weekdayBase: CronWeekdayBase = "unix"): CronExplanation {
    const parsed = parseCron({ expression, weekdayBase });

    if (!parsed.ok) {
        throw new Error(`expected "${expression}" to parse, got ${parsed.reason}`);
    }

    return explainCron(parsed);
}

function fieldPhrase(expression: string, field: CronFieldName) {
    const parsed = parseCron({ expression, weekdayBase: "unix" });

    if (!parsed.ok) {
        throw new Error(`expected "${expression}" to parse, got ${parsed.reason}`);
    }

    return describeField(parsed.fields[field]);
}

describe("the time clause", () => {
    test("a bare line is every minute, with nothing else to say", () => {
        expect(explain("* * * * *")).toEqual({
            reboot: false,
            time: { kind: "everyMinute" },
            qualifiers: [],
            dayUnion: false,
        });
    });

    test("a minute step reads as an interval, not as a column", () => {
        expect(explain("*/5 * * * *").time).toEqual({ kind: "everyNMinutes", step: 5 });
    });

    test("a seconds step reads the same way", () => {
        expect(explain("*/30 * * * * *").time).toEqual({ kind: "everyNSeconds", step: 30 });
        expect(explain("* * * * * *").time).toEqual({ kind: "everySecond" });
    });

    test("one minute of every hour names the minute, not twenty-four clock readings", () => {
        expect(explain("0 * * * *").time).toEqual({
            kind: "atMinutesOfEveryHour",
            minutes: { kind: "items", items: [{ kind: "value", value: 0 }] },
        });
    });

    test("a handful of fixed times are listed as a clock reads them", () => {
        expect(explain("0 4 * * *").time).toEqual({ kind: "atTimes", times: ["04:00"] });
        expect(explain("5 4 * * *").time).toEqual({ kind: "atTimes", times: ["04:05"] });
        expect(explain("0 9,17 * * *").time).toEqual({
            kind: "atTimes",
            times: ["09:00", "17:00"],
        });
        expect(explain("0,30 9,17 * * *").time).toEqual({
            kind: "atTimes",
            times: ["09:00", "09:30", "17:00", "17:30"],
        });
    });

    test("a seconds column shows up in the clock reading", () => {
        expect(explain("15 30 4 * * *").time).toEqual({ kind: "atTimes", times: ["04:30:15"] });
    });

    test("too many readings fall back to describing the columns", () => {
        expect(explain("0,30 9-17 * * *").time).toEqual({
            kind: "atMinutesPastHours",
            minutes: {
                kind: "items",
                items: [
                    { kind: "value", value: 0 },
                    { kind: "value", value: 30 },
                ],
            },
            hours: { kind: "items", items: [{ kind: "range", from: 9, to: 17 }] },
        });
    });

    test("a minute step inside named hours keeps both halves", () => {
        expect(explain("*/10 9-17 * * *").time).toEqual({
            kind: "everyNMinutesPastHours",
            step: 10,
            hours: { kind: "items", items: [{ kind: "range", from: 9, to: 17 }] },
        });
        expect(explain("* 9-17 * * *").time).toEqual({
            kind: "everyMinutePastHours",
            hours: { kind: "items", items: [{ kind: "range", from: 9, to: 17 }] },
        });
    });

    test("a seconds column that names more than one instant makes every column speak", () => {
        expect(explain("0,30 * * * * *").time).toMatchObject({ kind: "atSecondsMinutesHours" });
    });
});

describe("qualifiers", () => {
    test("an unrestricted column contributes nothing", () => {
        expect(explain("0 0 * * *").qualifiers).toEqual([]);
    });

    test("? is as unrestricted as a star", () => {
        expect(explain("0 0 1 * ?").qualifiers).toEqual([
            {
                field: "dayOfMonth",
                phrase: { kind: "items", items: [{ kind: "value", value: 1 }] },
            },
        ]);
    });

    test("they come out in calendar order", () => {
        expect(explain("0 0 0 1 JAN MON 2027").qualifiers.map((entry) => entry.field)).toEqual([
            "dayOfMonth",
            "month",
            "dayOfWeek",
            "year",
        ]);
    });

    test("the union rule is flagged only when both day columns are restricted", () => {
        expect(explain("0 0 1 * MON").dayUnion).toBe(true);
        expect(explain("0 0 * * MON").dayUnion).toBe(false);
        expect(explain("0 0 1 * *").dayUnion).toBe(false);
        // `?` is a star for this purpose, which is exactly why Quartz has it.
        expect(explain("0 0 1 * ?").dayUnion).toBe(false);
        // A stepped star is still a star.
        expect(explain("0 0 */2 * MON").dayUnion).toBe(false);
    });
});

describe("field phrases", () => {
    test("a star is every", () => {
        expect(fieldPhrase("* * * * *", "minute")).toEqual({ kind: "every" });
    });

    test("a step keeps its interval", () => {
        expect(fieldPhrase("*/5 * * * *", "minute")).toEqual({
            kind: "items",
            items: [{ kind: "everyStep", step: 5 }],
        });
    });

    test("a stepped range keeps both ends and the interval", () => {
        expect(fieldPhrase("0-30/10 * * * *", "minute")).toEqual({
            kind: "items",
            items: [{ kind: "step", from: 0, to: 30, step: 10 }],
        });
    });

    test("a list keeps its terms in the order they were written", () => {
        expect(fieldPhrase("0 0 * * MON-FRI,SUN", "dayOfWeek")).toEqual({
            kind: "items",
            items: [
                { kind: "range", from: 1, to: 5 },
                { kind: "value", value: 0 },
            ],
        });
    });

    test("calendar-relative terms survive intact", () => {
        expect(fieldPhrase("0 0 L-3 * *", "dayOfMonth")).toEqual({
            kind: "items",
            items: [{ kind: "lastDayOfMonth", offset: 3 }],
        });
        expect(fieldPhrase("0 0 LW * *", "dayOfMonth")).toEqual({
            kind: "items",
            items: [{ kind: "lastWeekday" }],
        });
        expect(fieldPhrase("0 0 15W * *", "dayOfMonth")).toEqual({
            kind: "items",
            items: [{ kind: "nearestWeekday", day: 15 }],
        });
        expect(fieldPhrase("0 0 * * FRI#3", "dayOfWeek")).toEqual({
            kind: "items",
            items: [{ kind: "nthWeekday", weekday: 5, nth: 3 }],
        });
        expect(fieldPhrase("0 0 * * 5L", "dayOfWeek")).toEqual({
            kind: "items",
            items: [{ kind: "lastWeekdayOfMonth", weekday: 5 }],
        });
    });
});

describe("macros", () => {
    test("read exactly as the fields they expand to", () => {
        expect(explain("@daily")).toEqual(explain("0 0 * * *"));
        expect(explain("@hourly")).toEqual(explain("0 * * * *"));
        expect(explain("@weekly")).toEqual(explain("0 0 * * 0"));
    });

    test("@reboot has no clause at all", () => {
        expect(explain("@reboot")).toMatchObject({ reboot: true, qualifiers: [] });
    });
});

describe("weekday numbering reaches the reading", () => {
    test("the same digits describe different days under each base", () => {
        expect(explain("0 0 * * 1-5").qualifiers[0].phrase).toEqual({
            kind: "items",
            items: [{ kind: "range", from: 1, to: 5 }],
        });
        expect(explain("0 0 * * 1-5", "quartz").qualifiers[0].phrase).toEqual({
            kind: "items",
            items: [{ kind: "range", from: 0, to: 4 }],
        });
    });
});
