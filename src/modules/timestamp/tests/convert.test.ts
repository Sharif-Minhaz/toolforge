import { describe, expect, test } from "bun:test";

import { convert, type TimestampConversionRequest } from "@/modules/timestamp/domain/convert";

const TARGET = Date.UTC(2026, 6, 29, 12, 0, 0);

const NOW = new Date(Date.UTC(2026, 6, 26, 9, 30, 0));

function request(overrides: Partial<TimestampConversionRequest> = {}): TimestampConversionRequest {
    return {
        input: "1785326400",
        unit: "auto",
        inputTimeZone: "UTC",
        timeZones: ["Asia/Dhaka", "UTC"],
        locale: "en",
        now: NOW,
        ...overrides,
    };
}

describe("convert", () => {
    test("passes a parse failure straight through", () => {
        expect(convert(request({ input: "" }))).toEqual({ ok: false, reason: "empty" });
        expect(convert(request({ input: "07/08/2026" }))).toEqual({
            ok: false,
            reason: "ambiguous_date",
        });
    });

    test("renders one card per requested zone, in the order given", () => {
        const result = convert(request());

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.zones.map((zone) => zone.timeZone)).toEqual(["Asia/Dhaka", "UTC"]);
        expect(result.zones[0].iso8601).toBe("2026-07-29T18:00:00+06:00");
        expect(result.zones[1].iso8601).toBe("2026-07-29T12:00:00Z");
    });

    test("keeps what the parser worked out about the reading", () => {
        expect(convert(request())).toMatchObject({
            ok: true,
            epochMs: TARGET,
            kind: "epoch",
            unit: "seconds",
            usedInputZone: false,
        });
    });

    test("reads the calendar facts in the first zone on screen", () => {
        // 2026-07-29T20:00Z is already Thursday the 30th in Dhaka.
        const result = convert(
            request({ input: String(Date.UTC(2026, 6, 29, 20)), unit: "milliseconds" }),
        );

        expect(result).toMatchObject({
            ok: true,
            factsTimeZone: "Asia/Dhaka",
            facts: { dayOfYear: 211, isoWeekDate: "2026-W31-4" },
        });
    });

    test("counts days from today in that same zone", () => {
        expect(convert(request())).toMatchObject({
            ok: true,
            facts: { dayOffsetFromToday: 3 },
            relative: "in 3 days",
        });
    });

    test("drops a zone this engine cannot format and says which", () => {
        const result = convert(request({ timeZones: ["UTC", "Middle/Earth", "Asia/Dhaka"] }));

        expect(result).toMatchObject({
            ok: true,
            unsupportedTimeZones: ["Middle/Earth"],
        });

        if (result.ok) {
            expect(result.zones.map((zone) => zone.timeZone)).toEqual(["UTC", "Asia/Dhaka"]);
        }
    });

    test("falls back to UTC for the facts when nothing is formattable", () => {
        expect(convert(request({ timeZones: ["Middle/Earth"] }))).toMatchObject({
            ok: true,
            factsTimeZone: "UTC",
            zones: [],
        });
    });

    test("is deterministic, so the server render and the client agree", () => {
        expect(convert(request())).toEqual(convert(request()));
    });
});
