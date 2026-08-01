import { describe, expect, test } from "bun:test";

import { checkSchedule, scheduleState } from "@/modules/short-links/domain/schedule";

const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);

function at(offsetMs: number): Date {
    return new Date(NOW + offsetMs);
}

const MINUTE = 60_000;

describe("scheduleState", () => {
    test("a link with no window is always live", () => {
        expect(scheduleState(null, null, NOW)).toBe("active");
    });

    test("before the start it is pending, from the start it is live", () => {
        expect(scheduleState(at(MINUTE), null, NOW)).toBe("pending");
        expect(scheduleState(at(0), null, NOW)).toBe("active");
        expect(scheduleState(at(-MINUTE), null, NOW)).toBe("active");
    });

    test("the expiry is exclusive — the link is dead the instant it arrives", () => {
        expect(scheduleState(null, at(MINUTE), NOW)).toBe("active");
        expect(scheduleState(null, at(0), NOW)).toBe("expired");
        expect(scheduleState(null, at(-MINUTE), NOW)).toBe("expired");
    });

    test("pending wins over expired when a window is entirely in the past", () => {
        // A start after the expiry cannot be stored, but a row that somehow held
        // one should read as "not yet" rather than silently redirecting.
        expect(scheduleState(at(MINUTE), at(-MINUTE), NOW)).toBe("pending");
    });

    test("inside the window is live, either side of it is not", () => {
        expect(scheduleState(at(-MINUTE), at(MINUTE), NOW)).toBe("active");
        expect(scheduleState(at(MINUTE), at(2 * MINUTE), NOW)).toBe("pending");
        expect(scheduleState(at(-2 * MINUTE), at(-MINUTE), NOW)).toBe("expired");
    });
});

describe("checkSchedule", () => {
    test("no window at all is fine", () => {
        expect(checkSchedule(null, null, NOW)).toEqual({ ok: true });
    });

    test("a start on its own is fine, past or future", () => {
        expect(checkSchedule(at(MINUTE), null, NOW)).toEqual({ ok: true });
        expect(checkSchedule(at(-MINUTE), null, NOW)).toEqual({ ok: true });
    });

    test("the start has to come before the end", () => {
        expect(checkSchedule(at(2 * MINUTE), at(MINUTE), NOW)).toEqual({
            ok: false,
            reason: "invalid_schedule",
        });
        expect(checkSchedule(at(MINUTE), at(MINUTE), NOW)).toEqual({
            ok: false,
            reason: "invalid_schedule",
        });
    });

    test("an expiry already gone is refused, so 'saved' never means 'still broken'", () => {
        expect(checkSchedule(null, at(-MINUTE), NOW)).toEqual({
            ok: false,
            reason: "expiry_in_past",
        });
        expect(checkSchedule(null, at(0), NOW)).toEqual({ ok: false, reason: "expiry_in_past" });
        expect(checkSchedule(null, at(1), NOW)).toEqual({ ok: true });
    });

    test("an impossible order is reported before a past expiry", () => {
        expect(checkSchedule(at(0), at(-MINUTE), NOW)).toEqual({
            ok: false,
            reason: "invalid_schedule",
        });
    });
});
