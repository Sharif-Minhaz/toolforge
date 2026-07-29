import { describe, expect, test } from "bun:test";

import { renderEpochs, renderRelative, renderZone } from "@/modules/timestamp/domain/format";
import { fieldsToUtcMs } from "@/modules/tools/domain/zone";

const TARGET = Date.UTC(2026, 6, 29, 12, 0, 0);

describe("renderEpochs", () => {
    test("gives every scale for one instant", () => {
        expect(renderEpochs(TARGET, 0)).toEqual({
            seconds: "1785326400",
            milliseconds: "1785326400000",
            microseconds: "1785326400000000",
            nanoseconds: "1785326400000000000",
        });
    });

    test("carries the sub-millisecond remainder into the finer scales", () => {
        expect(renderEpochs(TARGET + 123, 456_789)).toEqual({
            seconds: "1785326400",
            milliseconds: "1785326400123",
            microseconds: "1785326400123456",
            nanoseconds: "1785326400123456789",
        });
    });

    test("stays exact past what a Number can hold", () => {
        // 1785326400123456789 is larger than Number.MAX_SAFE_INTEGER, so a
        // number-based renderer loses the last two digits. This is why the
        // whole path is bigint.
        expect(renderEpochs(TARGET + 123, 456_789).nanoseconds).toBe("1785326400123456789");
        expect(String(Number("1785326400123456789"))).toBe("1785326400123456800");
    });

    test("floors rather than truncates on the pre-epoch side", () => {
        expect(renderEpochs(-1, 0)).toEqual({
            seconds: "-1",
            milliseconds: "-1",
            microseconds: "-1000",
            nanoseconds: "-1000000",
        });
        expect(renderEpochs(-1500, 0).seconds).toBe("-2");
    });

    test("the epoch itself is all zeroes", () => {
        expect(renderEpochs(0, 0)).toEqual({
            seconds: "0",
            milliseconds: "0",
            microseconds: "0",
            nanoseconds: "0",
        });
    });
});

describe("renderZone — machine formats", () => {
    test("spells ISO 8601 with the zone's own offset", () => {
        expect(renderZone(TARGET, "UTC", "en").iso8601).toBe("2026-07-29T12:00:00Z");
        expect(renderZone(TARGET, "Asia/Dhaka", "en").iso8601).toBe("2026-07-29T18:00:00+06:00");
        expect(renderZone(TARGET, "America/New_York", "en").iso8601).toBe(
            "2026-07-29T08:00:00-04:00",
        );
        expect(renderZone(TARGET, "Asia/Kolkata", "en").iso8601).toBe("2026-07-29T17:30:00+05:30");
    });

    test("adds milliseconds only when there are any", () => {
        expect(renderZone(TARGET + 250, "UTC", "en").iso8601).toBe("2026-07-29T12:00:00.250Z");
        expect(renderZone(TARGET + 5, "UTC", "en").iso8601).toBe("2026-07-29T12:00:00.005Z");
    });

    test("spells RFC 2822 in English whatever the reader's locale", () => {
        expect(renderZone(TARGET, "UTC", "bn").rfc2822).toBe("Wed, 29 Jul 2026 12:00:00 +0000");
        expect(renderZone(TARGET, "Asia/Dhaka", "bn").rfc2822).toBe(
            "Wed, 29 Jul 2026 18:00:00 +0600",
        );
    });

    test("keeps Western digits in every machine format under Bangla", () => {
        const bangla = renderZone(TARGET, "Asia/Dhaka", "bn");

        expect(bangla.iso8601).toBe("2026-07-29T18:00:00+06:00");
        expect(/[০-৯]/.test(bangla.iso8601)).toBe(false);
        expect(/[০-৯]/.test(bangla.rfc2822)).toBe(false);
    });

    test("pads the ISO year to four digits and expands beyond them", () => {
        // Built through `fieldsToUtcMs`, because `Date.UTC(50, …)` is 1950.
        const year50 = fieldsToUtcMs({
            year: 50,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
        });

        expect(renderZone(year50, "UTC", "en").iso8601).toBe("0050-01-01T00:00:00Z");
        expect(renderZone(Date.UTC(12_026, 0, 1), "UTC", "en").iso8601).toBe(
            "+012026-01-01T00:00:00Z",
        );
    });
});

describe("renderZone — human formats", () => {
    test("renders Bengali numerals for a Bangla reader", () => {
        const bangla = renderZone(TARGET, "Asia/Dhaka", "bn");

        expect(/[০-৯]/.test(bangla.fullDate)).toBe(true);
        expect(/[০-৯]/.test(bangla.dateOnly)).toBe(true);
    });

    test("names the zone in plain language", () => {
        expect(renderZone(TARGET, "America/New_York", "en").zoneName).toBe("Eastern Time");
        expect(renderZone(TARGET, "America/New_York", "en").abbreviation).toBe("EDT");
        expect(renderZone(TARGET, "America/New_York", "en").shortOffset).toBe("GMT-4");
    });

    test("reports the offset and the daylight state together", () => {
        expect(renderZone(TARGET, "America/New_York", "en")).toMatchObject({
            offsetMinutes: -240,
            offsetLabel: "-04:00",
            inDaylightTime: true,
        });
        expect(renderZone(Date.UTC(2026, 0, 15), "America/New_York", "en")).toMatchObject({
            offsetMinutes: -300,
            inDaylightTime: false,
        });
    });

    test("names the weekday of the instant, not of the epoch", () => {
        expect(renderZone(TARGET, "UTC", "en").weekday).toBe("Wednesday");
        // Dhaka is six hours ahead, so late Wednesday UTC is already Thursday.
        expect(renderZone(Date.UTC(2026, 6, 29, 20), "Asia/Dhaka", "en").weekday).toBe("Thursday");
    });
});

describe("renderRelative", () => {
    test("picks the largest unit that reads as more than one", () => {
        expect(renderRelative(TARGET, TARGET - 3 * 3_600_000, "en")).toBe("in 3 hours");
        expect(renderRelative(TARGET, TARGET + 3 * 3_600_000, "en")).toBe("3 hours ago");
        expect(renderRelative(TARGET, TARGET - 2 * 86_400_000, "en")).toBe("in 2 days");
        expect(renderRelative(TARGET, TARGET - 400 * 86_400_000, "en")).toBe("next year");
    });

    test("says now rather than in 0 seconds", () => {
        expect(renderRelative(TARGET, TARGET, "en")).toBe("now");
        expect(renderRelative(TARGET, TARGET - 400, "en")).toBe("now");
    });

    test("localises", () => {
        expect(/[০-৯]/.test(renderRelative(TARGET, TARGET - 3 * 3_600_000, "bn"))).toBe(true);
    });
});
