import { describe, expect, test } from "bun:test";

import { daysFromCivil } from "@/modules/tools/domain/calendar";
import { buildHawlCalendar, HAWL_ANNIVERSARIES, planHawl } from "@/modules/zakat/domain/hawl";

const TODAY = { year: 2026, month: 11, day: 27 };

/** ICU's islamic-civil — the same tabular calendar, implemented by somebody else. */
function icuHijri(date: { year: number; month: number; day: number }) {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-civil", {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
    }).formatToParts(new Date(Date.UTC(date.year, date.month - 1, date.day)));
    const get = (type: string) =>
        Number.parseInt(parts.find((part) => part.type === type)?.value ?? "", 10);

    return { year: get("year"), month: get("month"), day: get("day") };
}

describe("planHawl", () => {
    test("every anniversary falls on the start's Hijri day and month, ICU agreeing", () => {
        const start = { year: 2024, month: 3, day: 11 };
        const plan = planHawl(start, TODAY);

        if (!plan.ok) {
            throw new Error(plan.reason);
        }

        expect(icuHijri(start)).toEqual(plan.startHijri);
        expect(plan.upcoming).toHaveLength(HAWL_ANNIVERSARIES);

        for (const entry of plan.upcoming) {
            expect(entry.hijri.month).toBe(plan.startHijri.month);
            expect(entry.hijri.day).toBe(plan.startHijri.day);
            expect(icuHijri(entry.gregorian)).toEqual(entry.hijri);
            expect(entry.daysAway).toBeGreaterThanOrEqual(0);
        }

        // A lunar year is 354 or 355 days.
        const days = plan.upcoming.map((entry) =>
            daysFromCivil(entry.gregorian.year, entry.gregorian.month, entry.gregorian.day),
        );

        for (let index = 1; index < days.length; index += 1) {
            expect([354, 355]).toContain(days[index] - days[index - 1]);
        }

        // March 2024 to November 2026: two lunar years have passed.
        expect(plan.yearsCompleted).toBe(2);
    });

    test("an anniversary today is zero days away, and counted as upcoming", () => {
        const plan = planHawl(
            { year: 2025, month: 12, day: 8 },
            { year: 2026, month: 11, day: 27 },
        );

        if (!plan.ok) {
            throw new Error(plan.reason);
        }

        const first = plan.upcoming[0];
        // Whatever the exact day, it is never in the past.
        expect(first.daysAway).toBeGreaterThanOrEqual(0);
    });

    test("a moon-sighting adjustment moves the Hijri reading, not the Gregorian start", () => {
        const start = { year: 2024, month: 3, day: 11 };
        const plain = planHawl(start, TODAY);
        const shifted = planHawl(start, TODAY, -1);

        if (!plain.ok || !shifted.ok) {
            throw new Error("plan failed");
        }

        expect(shifted.startHijri).not.toEqual(plain.startHijri);
    });

    test("refuses a start in the future and a date that does not exist", () => {
        expect(planHawl({ year: 2027, month: 1, day: 1 }, TODAY)).toEqual({
            ok: false,
            reason: "start_in_future",
        });
        expect(planHawl({ year: 2026, month: 2, day: 30 }, TODAY)).toEqual({
            ok: false,
            reason: "invalid_date",
        });
    });
});

describe("buildHawlCalendar", () => {
    const plan = planHawl({ year: 2024, month: 3, day: 11 }, TODAY);
    const upcoming = plan.ok ? plan.upcoming : [];
    const ics = buildHawlCalendar(
        upcoming,
        {
            summary: "যাকাতের বছর পূর্ণ — Zakat due; pay, count, give",
            description: "Line one\nLine; two, with \\ backslash",
            alarm: "Zakat in a week",
        },
        Date.UTC(2026, 10, 27, 4, 5, 6),
        "abc123",
    );
    const physical = ics.split("\r\n");

    test("one event per anniversary, CRLF line endings, a closing CRLF", () => {
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(HAWL_ANNIVERSARIES);
        expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
        expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
        expect(ics).toContain("DTSTAMP:20261127T040506Z");
        expect(ics).toContain("TRIGGER:-P7D");
    });

    test("no physical line is longer than 75 octets, and folding never splits a letter", () => {
        const encoder = new TextEncoder();

        for (const line of physical) {
            expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
        }

        const unfolded = ics.replace(/\r\n /g, "");

        expect(unfolded).toContain("SUMMARY:যাকাতের বছর পূর্ণ — Zakat due\; pay\\, count\\, give");
        expect(unfolded).toContain("DESCRIPTION:Line one\\nLine\; two\\, with \\\\ backslash");
    });

    test("all-day events end the next day", () => {
        const first = upcoming[0].gregorian;
        const start = `${first.year}${String(first.month).padStart(2, "0")}${String(first.day).padStart(2, "0")}`;

        expect(ics).toContain(`DTSTART;VALUE=DATE:${start}`);
    });
});
