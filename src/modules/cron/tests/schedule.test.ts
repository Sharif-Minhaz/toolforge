import { describe, expect, test } from "bun:test";

import { MAX_RUN_COUNT } from "@/modules/cron/domain/constants";
import { parseCron } from "@/modules/cron/domain/parse";
import {
    getLastWeekdayOfMonth,
    getNearestWeekday,
    getNextRuns,
} from "@/modules/cron/domain/schedule";
import type { CronScheduleResult, CronWeekdayBase } from "@/modules/cron/types";

/** 2026-07-29T12:00:00Z, a Wednesday. Every expectation below counts from it. */
const FROM = Date.UTC(2026, 6, 29, 12, 0, 0);

type Options = {
    from?: number;
    timeZone?: string;
    count?: number;
    weekdayBase?: CronWeekdayBase;
};

function schedule(expression: string, options: Options = {}): CronScheduleResult {
    const parsed = parseCron({
        expression,
        weekdayBase: options.weekdayBase ?? "unix",
    });

    if (!parsed.ok) {
        throw new Error(`expected "${expression}" to parse, got ${parsed.reason}`);
    }

    return getNextRuns({
        expression: parsed,
        from: options.from ?? FROM,
        timeZone: options.timeZone ?? "UTC",
        count: options.count ?? 3,
    });
}

function runsOf(expression: string, options: Options = {}): readonly string[] {
    return schedule(expression, options).runs.map((epochMs) => new Date(epochMs).toISOString());
}

describe("the clock columns", () => {
    test("every minute lands on the minute, and never on the instant it started from", () => {
        expect(runsOf("* * * * *")).toEqual([
            "2026-07-29T12:01:00.000Z",
            "2026-07-29T12:02:00.000Z",
            "2026-07-29T12:03:00.000Z",
        ]);
    });

    test("a step counts from the top of the hour, not from now", () => {
        expect(runsOf("*/15 * * * *", { from: Date.UTC(2026, 6, 29, 12, 7, 0) })).toEqual([
            "2026-07-29T12:15:00.000Z",
            "2026-07-29T12:30:00.000Z",
            "2026-07-29T12:45:00.000Z",
        ]);
    });

    test("a fixed time rolls to tomorrow once today's has passed", () => {
        expect(runsOf("0 4 * * *")).toEqual([
            "2026-07-30T04:00:00.000Z",
            "2026-07-31T04:00:00.000Z",
            "2026-08-01T04:00:00.000Z",
        ]);
    });

    test("a seconds column is honoured", () => {
        expect(runsOf("*/30 * * * * *")).toEqual([
            "2026-07-29T12:00:30.000Z",
            "2026-07-29T12:01:00.000Z",
            "2026-07-29T12:01:30.000Z",
        ]);
    });

    test("a list produces one run per entry, in order", () => {
        expect(runsOf("0 9,17 * * *", { count: 4 })).toEqual([
            "2026-07-29T17:00:00.000Z",
            "2026-07-30T09:00:00.000Z",
            "2026-07-30T17:00:00.000Z",
            "2026-07-31T09:00:00.000Z",
        ]);
    });

    test("runs come back strictly ascending", () => {
        const { runs } = schedule("*/7 */3 * * *", { count: MAX_RUN_COUNT });

        expect(runs.length).toBe(MAX_RUN_COUNT);

        for (let index = 1; index < runs.length; index++) {
            expect(runs[index]).toBeGreaterThan(runs[index - 1]);
        }
    });
});

describe("the calendar columns", () => {
    test("29 February waits for the next leap year", () => {
        expect(runsOf("0 0 29 2 *", { count: 2 })).toEqual([
            "2028-02-29T00:00:00.000Z",
            "2032-02-29T00:00:00.000Z",
        ]);
    });

    test("30 February never arrives, and says so instead of hanging", () => {
        expect(schedule("0 0 30 2 *")).toEqual({ runs: [], exhausted: true, skipped: 0 });
    });

    test("a year column that has run out is exhausted, not empty-handed", () => {
        const result = schedule("0 0 0 1 1 ? 2027", { count: 3 });

        expect(result.runs.map((ms) => new Date(ms).toISOString())).toEqual([
            "2027-01-01T00:00:00.000Z",
        ]);
        expect(result.exhausted).toBe(true);
    });

    test("@reboot has no next run", () => {
        expect(schedule("@reboot")).toEqual({ runs: [], exhausted: true, skipped: 0 });
    });
});

describe("the two day columns", () => {
    test("one starred column intersects: Mondays only", () => {
        expect(runsOf("0 0 * * MON")).toEqual([
            "2026-08-03T00:00:00.000Z",
            "2026-08-10T00:00:00.000Z",
            "2026-08-17T00:00:00.000Z",
        ]);
    });

    test("both columns restricted unions: the 1st *or* any Monday", () => {
        expect(runsOf("0 0 1 * MON", { count: 4 })).toEqual([
            // 1 August 2026 is a Saturday — it fires because of the date, not the day.
            "2026-08-01T00:00:00.000Z",
            "2026-08-03T00:00:00.000Z",
            "2026-08-10T00:00:00.000Z",
            "2026-08-17T00:00:00.000Z",
        ]);
    });

    test("a stepped star is still a star, so it intersects", () => {
        // Every second day *and* a Monday, not either — 3 August is a Monday.
        expect(runsOf("0 0 */2 * MON", { count: 2 })).toEqual([
            "2026-08-03T00:00:00.000Z",
            "2026-08-17T00:00:00.000Z",
        ]);
    });

    test("? leaves the decision to the other column", () => {
        expect(runsOf("0 0 1 * ?", { count: 2 })).toEqual([
            "2026-08-01T00:00:00.000Z",
            "2026-09-01T00:00:00.000Z",
        ]);
    });
});

describe("quartz calendar syntax", () => {
    test("L is the last day of each month, whatever its length", () => {
        expect(runsOf("0 0 L * *")).toEqual([
            "2026-07-31T00:00:00.000Z",
            "2026-08-31T00:00:00.000Z",
            "2026-09-30T00:00:00.000Z",
        ]);
    });

    test("L-n counts back from the last day", () => {
        // July's L-2 is the 29th, whose midnight is already behind `FROM`.
        expect(runsOf("0 0 L-2 * *", { count: 2 })).toEqual([
            "2026-08-29T00:00:00.000Z",
            "2026-09-28T00:00:00.000Z",
        ]);
    });

    test("LW is the last Monday-to-Friday day of the month", () => {
        // 31 August 2026 is a Monday; 30 September 2026 is a Wednesday.
        expect(runsOf("0 0 LW * *")).toEqual([
            "2026-07-31T00:00:00.000Z",
            "2026-08-31T00:00:00.000Z",
            "2026-09-30T00:00:00.000Z",
        ]);
    });

    test("nW moves off a weekend without leaving the month", () => {
        // 15 August 2026 is a Saturday, so it fires on Friday the 14th.
        expect(runsOf("0 0 15W * *", { count: 2 })).toEqual([
            "2026-08-14T00:00:00.000Z",
            "2026-09-15T00:00:00.000Z",
        ]);
    });

    test("n#m is the nth weekday of the month", () => {
        // Fridays in August 2026 are the 7th, 14th, 21st and 28th.
        expect(runsOf("0 0 * * FRI#3", { count: 2 })).toEqual([
            "2026-08-21T00:00:00.000Z",
            "2026-09-18T00:00:00.000Z",
        ]);
    });

    test("nL is the last such weekday of the month", () => {
        expect(runsOf("0 0 * * 5L", { count: 2 })).toEqual([
            "2026-07-31T00:00:00.000Z",
            "2026-08-28T00:00:00.000Z",
        ]);
    });

    test("the quartz numbering shifts which day a digit means", () => {
        // Unix 6 is Saturday; Quartz 6 is Friday.
        expect(runsOf("0 0 * * 6#3", { count: 1 })).toEqual(["2026-08-15T00:00:00.000Z"]);
        expect(runsOf("0 0 * * 6#3", { count: 1, weekdayBase: "quartz" })).toEqual([
            "2026-08-21T00:00:00.000Z",
        ]);
    });
});

describe("calendar helpers", () => {
    test("getLastWeekdayOfMonth walks back off a weekend", () => {
        // 31 May 2026 is a Sunday, 30 May a Saturday, 29 May a Friday.
        expect(getLastWeekdayOfMonth(2026, 5)).toBe(29);
        // 31 August 2026 is a Monday.
        expect(getLastWeekdayOfMonth(2026, 8)).toBe(31);
    });

    test("getNearestWeekday never crosses a month boundary", () => {
        // 1 August 2026 is a Saturday: forward to Monday the 3rd, not back into July.
        expect(getNearestWeekday(2026, 8, 1)).toBe(3);
        // 31 May 2026 is a Sunday: back to Friday the 29th, not forward into June.
        expect(getNearestWeekday(2026, 5, 31)).toBe(29);
        // A day the month does not have never matches.
        expect(getNearestWeekday(2026, 2, 30)).toBe(-1);
    });
});

describe("time zones", () => {
    test("midnight means midnight where the job runs", () => {
        expect(runsOf("0 0 * * *", { timeZone: "Asia/Dhaka", count: 1 })).toEqual([
            "2026-07-29T18:00:00.000Z",
        ]);
        expect(runsOf("0 0 * * *", { timeZone: "UTC", count: 1 })).toEqual([
            "2026-07-30T00:00:00.000Z",
        ]);
    });

    test("a wall clock erased by spring forward is dropped and counted", () => {
        // US DST starts 8 March 2026: 02:00 becomes 03:00, so 02:30 never happens.
        const result = schedule("30 2 * * *", {
            timeZone: "America/New_York",
            from: Date.UTC(2026, 2, 7, 12, 0, 0),
            count: 2,
        });

        expect(result.runs.map((ms) => new Date(ms).toISOString())).toEqual([
            "2026-03-09T06:30:00.000Z",
            "2026-03-10T06:30:00.000Z",
        ]);
        expect(result.skipped).toBe(1);
    });

    test("a wall clock repeated by falling back fires once, on the first pass", () => {
        // US DST ends 1 November 2026: 01:30 happens at 05:30Z and again at 06:30Z.
        const result = schedule("30 1 * * *", {
            timeZone: "America/New_York",
            from: Date.UTC(2026, 9, 31, 12, 0, 0),
            count: 2,
        });

        expect(result.runs.map((ms) => new Date(ms).toISOString())).toEqual([
            "2026-11-01T05:30:00.000Z",
            "2026-11-02T06:30:00.000Z",
        ]);
        expect(result.skipped).toBe(0);
    });
});

describe("bounds", () => {
    test("the run count is clamped to the ceiling", () => {
        expect(schedule("* * * * *", { count: 500 }).runs.length).toBe(MAX_RUN_COUNT);
    });

    test("asking for nothing returns nothing", () => {
        expect(schedule("* * * * *", { count: 0 }).runs).toEqual([]);
    });
});
