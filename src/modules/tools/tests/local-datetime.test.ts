import { describe, expect, test } from "bun:test";

import {
    instantToLocalDateTime,
    localDateTimeToInstant,
    parseLocalDateTime,
} from "@/modules/tools/domain/local-datetime";

describe("parseLocalDateTime", () => {
    test("reads the fields a datetime-local input produces", () => {
        expect(parseLocalDateTime("2026-08-09T17:30")).toEqual({
            year: 2026,
            month: 8,
            day: 9,
            hour: 17,
            minute: 30,
            second: 0,
            millisecond: 0,
        });
    });

    test("accepts the seconds some browsers add", () => {
        expect(parseLocalDateTime("2026-08-09T17:30:45")?.second).toBe(45);
    });

    test("a blank or malformed value is null, not a guess", () => {
        for (const value of [
            "",
            "   ",
            "2026-08-09",
            "17:30",
            "2026-8-9T17:30",
            "2026-08-09 17:30",
            "2026-08-09T17:30Z",
            "tomorrow",
        ]) {
            expect(parseLocalDateTime(value)).toBeNull();
        }
    });

    test("refuses a rolled-over field instead of absorbing it", () => {
        for (const value of [
            "2026-13-01T00:00",
            "2026-00-01T00:00",
            "2026-08-32T00:00",
            "2026-08-00T00:00",
            "2026-08-09T24:00",
            "2026-08-09T12:60",
            "2026-08-09T12:00:60",
        ]) {
            expect(parseLocalDateTime(value)).toBeNull();
        }
    });
});

describe("localDateTimeToInstant", () => {
    test("the same wall clock is a different instant in a different zone", () => {
        const utc = localDateTimeToInstant("2026-08-09T17:30", "UTC");
        const dhaka = localDateTimeToInstant("2026-08-09T17:30", "Asia/Dhaka");

        expect(utc).toBe("2026-08-09T17:30:00.000Z");
        // Dhaka is UTC+6 all year.
        expect(dhaka).toBe("2026-08-09T11:30:00.000Z");
    });

    test("a zone with daylight saving is read at the offset in force that day", () => {
        // New York is UTC−4 in August and UTC−5 in January.
        expect(localDateTimeToInstant("2026-08-09T12:00", "America/New_York")).toBe(
            "2026-08-09T16:00:00.000Z",
        );
        expect(localDateTimeToInstant("2026-01-09T12:00", "America/New_York")).toBe(
            "2026-01-09T17:00:00.000Z",
        );
    });

    test("a blank or malformed field is null, which the form reads as 'no window'", () => {
        expect(localDateTimeToInstant("", "UTC")).toBeNull();
        expect(localDateTimeToInstant("nonsense", "UTC")).toBeNull();
    });
});

describe("instantToLocalDateTime", () => {
    test("fills the field with the wall clock in the reader's own zone", () => {
        expect(instantToLocalDateTime("2026-08-09T11:30:00.000Z", "Asia/Dhaka")).toBe(
            "2026-08-09T17:30",
        );
        expect(instantToLocalDateTime("2026-08-09T11:30:00.000Z", "UTC")).toBe("2026-08-09T11:30");
    });

    test("round-trips through the instant and back in the same zone", () => {
        for (const zone of ["UTC", "Asia/Dhaka", "America/New_York", "Australia/Adelaide"]) {
            const typed = "2026-08-09T17:30";
            const instant = localDateTimeToInstant(typed, zone);

            expect(instant).not.toBeNull();
            expect(instantToLocalDateTime(instant, zone)).toBe(typed);
        }
    });

    test("no window, or an unreadable one, leaves the field empty", () => {
        expect(instantToLocalDateTime(null, "UTC")).toBe("");
        expect(instantToLocalDateTime("not an instant", "UTC")).toBe("");
    });
});
