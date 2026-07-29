import { describe, expect, test } from "bun:test";

import { parseCron } from "@/modules/cron/domain/parse";
import type {
    CronExpression,
    CronFailure,
    CronFailureReason,
    CronFieldName,
    CronWeekdayBase,
} from "@/modules/cron/types";

function parse(expression: string, weekdayBase: CronWeekdayBase = "unix") {
    return parseCron({ expression, weekdayBase });
}

function expectOk(expression: string, weekdayBase: CronWeekdayBase = "unix"): CronExpression {
    const result = parse(expression, weekdayBase);

    if (!result.ok) {
        throw new Error(`expected "${expression}" to parse, got ${result.reason}`);
    }

    return result;
}

function expectFailure(expression: string, weekdayBase: CronWeekdayBase = "unix"): CronFailure {
    const result = parse(expression, weekdayBase);

    if (result.ok) {
        throw new Error(`expected "${expression}" to fail`);
    }

    return result;
}

function valuesOf(expression: string, field: CronFieldName): readonly number[] {
    return expectOk(expression).fields[field].values;
}

describe("field counts", () => {
    test("five fields are minute first, with a zeroth second filled in", () => {
        const parsed = expectOk("5 4 3 2 1");

        expect(parsed.fieldCount).toBe(5);
        expect(parsed.hasSeconds).toBe(false);
        expect(parsed.fields.second.values).toEqual([0]);
        expect(parsed.fields.minute.values).toEqual([5]);
        expect(parsed.fields.hour.values).toEqual([4]);
        expect(parsed.fields.dayOfMonth.values).toEqual([3]);
        expect(parsed.fields.month.values).toEqual([2]);
        expect(parsed.fields.dayOfWeek.values).toEqual([1]);
        expect(parsed.fields.year.values.length).toBe(230);
    });

    test("six fields put seconds in front", () => {
        const parsed = expectOk("30 5 4 3 2 1");

        expect(parsed.fieldCount).toBe(6);
        expect(parsed.hasSeconds).toBe(true);
        expect(parsed.fields.second.values).toEqual([30]);
        expect(parsed.fields.minute.values).toEqual([5]);
    });

    test("seven fields add a year column", () => {
        const parsed = expectOk("0 0 0 1 1 ? 2027-2029");

        expect(parsed.fieldCount).toBe(7);
        expect(parsed.fields.year.values).toEqual([2027, 2028, 2029]);
    });

    test("four or eight fields are rejected", () => {
        expect(expectFailure("* * * *").reason).toBe("field_count");
        expect(expectFailure("* * * * * * * *").reason).toBe("field_count");
    });

    test("runs of whitespace collapse before the split", () => {
        expect(expectOk("  0\t0   *  * *  ").source).toBe("0 0 * * *");
    });

    test("an empty expression is reported as empty, not as a bad field count", () => {
        expect(expectFailure("").reason).toBe("empty");
        expect(expectFailure("   ").reason).toBe("empty");
    });

    test("an absurdly long line is rejected before the parse", () => {
        expect(expectFailure(`${"1,".repeat(200)}1 * * * *`).reason).toBe("too_long");
    });
});

describe("terms", () => {
    test("a star covers the whole field", () => {
        expect(valuesOf("* * * * *", "minute").length).toBe(60);
        expect(valuesOf("* * * * *", "hour").length).toBe(24);
        expect(valuesOf("* * * * *", "dayOfMonth")).toEqual(
            Array.from({ length: 31 }, (_, index) => index + 1),
        );
        expect(valuesOf("* * * * *", "dayOfWeek")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    test("a step counts from the bottom of the field", () => {
        expect(valuesOf("*/15 * * * *", "minute")).toEqual([0, 15, 30, 45]);
        expect(valuesOf("* */6 * * *", "hour")).toEqual([0, 6, 12, 18]);
        // Day of month starts at 1, not 0.
        expect(valuesOf("* * */10 * *", "dayOfMonth")).toEqual([1, 11, 21, 31]);
    });

    test("a range is inclusive at both ends", () => {
        expect(valuesOf("* 9-17 * * *", "hour")).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    test("a range can carry its own step", () => {
        expect(valuesOf("0-30/10 * * * *", "minute")).toEqual([0, 10, 20, 30]);
    });

    test("a lone value with a step is Quartz's open-ended range", () => {
        expect(valuesOf("5/15 * * * *", "minute")).toEqual([5, 20, 35, 50]);
    });

    test("a list merges, deduplicates and sorts", () => {
        expect(valuesOf("30,0,15,0 * * * *", "minute")).toEqual([0, 15, 30]);
    });

    test("month and weekday names are read case-insensitively", () => {
        expect(valuesOf("0 0 * JAN,jul *", "month")).toEqual([1, 7]);
        expect(valuesOf("0 0 * * Mon-fri", "dayOfWeek")).toEqual([1, 2, 3, 4, 5]);
    });

    test("the raw text is kept for the breakdown grid", () => {
        expect(expectOk("*/5 9-17 * * MON-FRI").fields.dayOfWeek.raw).toBe("MON-FRI");
    });
});

describe("day-of-week numbering", () => {
    test("unix counts Sunday as 0 and accepts 7 as a second spelling", () => {
        expect(valuesOf("0 0 * * 0", "dayOfWeek")).toEqual([0]);
        expect(valuesOf("0 0 * * 7", "dayOfWeek")).toEqual([0]);
        expect(valuesOf("0 0 * * 0-7", "dayOfWeek")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    test("a unix range that wraps past Saturday comes back as the days it means", () => {
        // 5-7 is Friday, Saturday, Sunday — no longer contiguous once Sunday is 0.
        expect(valuesOf("0 0 * * 5-7", "dayOfWeek")).toEqual([0, 5, 6]);
    });

    test("quartz counts Sunday as 1, so the same digits mean other days", () => {
        expect(parseCron({ expression: "0 0 * * 1", weekdayBase: "quartz" })).toMatchObject({
            ok: true,
        });
        expect((expectOk("0 0 * * 1", "quartz") as CronExpression).fields.dayOfWeek.values).toEqual(
            [0],
        );
        expect(expectOk("0 0 * * 2-6", "quartz").fields.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    });

    test("a name means the same day under either base", () => {
        expect(valuesOf("0 0 * * FRI", "dayOfWeek")).toEqual([5]);
        expect(expectOk("0 0 * * FRI", "quartz").fields.dayOfWeek.values).toEqual([5]);
    });

    test("quartz rejects a zero it has no day for", () => {
        expect(expectFailure("0 0 * * 0", "quartz").reason).toBe("out_of_range");
    });
});

describe("macros", () => {
    const cases: readonly (readonly [string, string])[] = [
        ["@yearly", "0 0 1 1 *"],
        ["@annually", "0 0 1 1 *"],
        ["@monthly", "0 0 1 * *"],
        ["@weekly", "0 0 * * 0"],
        ["@daily", "0 0 * * *"],
        ["@midnight", "0 0 * * *"],
        ["@hourly", "0 * * * *"],
    ];

    for (const [macro, equivalent] of cases) {
        test(`${macro} expands to ${equivalent}`, () => {
            const fromMacro = expectOk(macro);
            const fromFields = expectOk(equivalent);

            expect(fromMacro.fields.minute.values).toEqual(fromFields.fields.minute.values);
            expect(fromMacro.fields.hour.values).toEqual(fromFields.fields.hour.values);
            expect(fromMacro.fields.dayOfMonth.values).toEqual(fromFields.fields.dayOfMonth.values);
            expect(fromMacro.fields.month.values).toEqual(fromFields.fields.month.values);
            expect(fromMacro.fields.dayOfWeek.values).toEqual(fromFields.fields.dayOfWeek.values);
            expect(fromMacro.source).toBe(macro);
        });
    }

    test("@reboot parses but carries no schedule", () => {
        const parsed = expectOk("@REBOOT");

        expect(parsed.reboot).toBe(true);
        expect(parsed.macro).toBe("reboot");
        expect(parsed.fields.minute.values).toEqual([]);
    });

    test("an unknown macro is named as such", () => {
        expect(expectFailure("@fortnightly")).toMatchObject({
            reason: "unknown_macro",
            token: "@fortnightly",
        });
    });
});

describe("quartz calendar syntax", () => {
    test("L, LW and L-n are day-of-month terms", () => {
        expect(expectOk("0 0 L * *").fields.dayOfMonth.terms).toEqual([
            { kind: "lastDayOfMonth", offset: 0 },
        ]);
        expect(expectOk("0 0 L-3 * *").fields.dayOfMonth.terms).toEqual([
            { kind: "lastDayOfMonth", offset: 3 },
        ]);
        expect(expectOk("0 0 LW * *").fields.dayOfMonth.terms).toEqual([{ kind: "lastWeekday" }]);
    });

    test("nW names the weekday nearest a date", () => {
        expect(expectOk("0 0 15W * *").fields.dayOfMonth.terms).toEqual([
            { kind: "nearestWeekday", day: 15 },
        ]);
    });

    test("nL and n#m are day-of-week terms, normalised to Sunday-first", () => {
        expect(expectOk("0 0 * * 5L").fields.dayOfWeek.terms).toEqual([
            { kind: "lastWeekdayOfMonth", weekday: 5 },
        ]);
        expect(expectOk("0 0 * * FRI#3").fields.dayOfWeek.terms).toEqual([
            { kind: "nthWeekday", weekday: 5, nth: 3 },
        ]);
        // Quartz's 6 is Friday, where unix's 6 is Saturday.
        expect(expectOk("0 0 * * 6#3", "quartz").fields.dayOfWeek.terms).toEqual([
            { kind: "nthWeekday", weekday: 5, nth: 3 },
        ]);
        expect(expectOk("0 0 * * 6#3").fields.dayOfWeek.terms).toEqual([
            { kind: "nthWeekday", weekday: 6, nth: 3 },
        ]);
    });

    test("calendar terms contribute no fixed values", () => {
        expect(expectOk("0 0 L * *").fields.dayOfMonth.values).toEqual([]);
        expect(expectOk("0 0 1,L * *").fields.dayOfMonth.values).toEqual([1]);
    });

    test("? marks a day column as left to the other one", () => {
        const parsed = expectOk("0 0 L * ?");

        expect(parsed.fields.dayOfWeek.unspecified).toBe(true);
        expect(parsed.fields.dayOfWeek.star).toBe(true);
        expect(parsed.fields.dayOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    test("calendar syntax in a column that has no calendar is called out", () => {
        for (const expression of ["L 0 * * *", "0 15W * * *", "0 0 * 5#3 *", "0 0 * * *#3"]) {
            expect(expectFailure(expression).reason).toBe("unsupported_syntax");
        }
    });

    test("? outside a day column is rejected", () => {
        expect(expectFailure("0 ? * * *")).toMatchObject({
            reason: "unsupported_syntax",
            field: "hour",
        });
    });

    test("a month has at most five of any weekday", () => {
        expect(expectFailure("0 0 * * 5#6").reason).toBe("invalid_nth");
        expect(expectFailure("0 0 * * 5#0").reason).toBe("invalid_nth");
        expect(expectOk("0 0 * * 5#5").fields.dayOfWeek.terms).toEqual([
            { kind: "nthWeekday", weekday: 5, nth: 5 },
        ]);
    });

    test("WED is a weekday name, not a W suffix", () => {
        expect(valuesOf("0 0 * * WED", "dayOfWeek")).toEqual([3]);
    });
});

describe("failures name the column and quote the term", () => {
    const cases: readonly (readonly [string, CronFailureReason, CronFieldName])[] = [
        ["60 * * * *", "out_of_range", "minute"],
        ["* 24 * * *", "out_of_range", "hour"],
        ["* * 32 * *", "out_of_range", "dayOfMonth"],
        ["* * * 13 *", "out_of_range", "month"],
        ["* * * * 8", "out_of_range", "dayOfWeek"],
        ["0 0 0 1 1 ? 1969", "out_of_range", "year"],
        ["10-2 * * * *", "reversed_range", "minute"],
        ["*/0 * * * *", "invalid_step", "minute"],
        ["*/ * * * *", "invalid_step", "minute"],
        ["*/2/3 * * * *", "invalid_step", "minute"],
        ["1,,2 * * * *", "empty_term", "minute"],
        ["1, * * * *", "empty_term", "minute"],
        ["banana * * * *", "invalid_term", "minute"],
        ["0 0 * FOO *", "invalid_term", "month"],
    ];

    for (const [expression, reason, field] of cases) {
        test(`${expression} → ${reason}`, () => {
            expect(expectFailure(expression)).toMatchObject({ reason, field });
        });
    }

    test("a reversed range is rejected rather than silently wrapping", () => {
        expect(expectFailure("0 0 * * FRI-MON")).toMatchObject({
            reason: "reversed_range",
            token: "FRI-MON",
        });
    });
});

describe("the star flag", () => {
    test("is set for a bare star and for a stepped one", () => {
        expect(expectOk("0 0 * * *").fields.dayOfMonth.star).toBe(true);
        expect(expectOk("0 0 */2 * *").fields.dayOfMonth.star).toBe(true);
    });

    test("is clear once the column names anything", () => {
        expect(expectOk("0 0 1 * *").fields.dayOfMonth.star).toBe(false);
        expect(expectOk("0 0 1-5 * *").fields.dayOfMonth.star).toBe(false);
    });
});
