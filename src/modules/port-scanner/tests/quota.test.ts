import { describe, expect, test } from "bun:test";

import { QUOTA_LIMIT, QUOTA_WINDOW_MS } from "@/modules/port-scanner/domain/constants";
import {
    describeQuota,
    effectiveCount,
    hasWindowExpired,
    isQuotaExhausted,
    windowStartFor,
} from "@/modules/port-scanner/domain/quota";

/** Frozen, because a limit tested against a real clock is a flaky limit. */
const NOW = new Date("2026-08-04T14:30:00.000Z");

function ago(ms: number): Date {
    return new Date(NOW.getTime() - ms);
}

describe("window expiry", () => {
    test("a window that started inside the period is still running", () => {
        expect(hasWindowExpired({ count: 3, windowStart: ago(QUOTA_WINDOW_MS - 1) }, NOW)).toBe(
            false,
        );
    });

    test("a window exactly one period old has turned over", () => {
        expect(hasWindowExpired({ count: 3, windowStart: ago(QUOTA_WINDOW_MS) }, NOW)).toBe(true);
    });

    test("a window opened this instant is running", () => {
        expect(hasWindowExpired({ count: 0, windowStart: NOW }, NOW)).toBe(false);
    });
});

describe("effectiveCount", () => {
    test("a visitor with no row has spent nothing", () => {
        expect(effectiveCount(null, NOW)).toBe(0);
    });

    test("counts what was spent inside the running window", () => {
        expect(effectiveCount({ count: 4, windowStart: ago(60_000) }, NOW)).toBe(4);
    });

    /** The reset is derived, not swept — nothing has to run on a schedule. */
    test("an expired window reads as zero without the row being touched", () => {
        expect(effectiveCount({ count: QUOTA_LIMIT, windowStart: ago(QUOTA_WINDOW_MS) }, NOW)).toBe(
            0,
        );
    });
});

describe("isQuotaExhausted", () => {
    test("lets a visitor through below the limit", () => {
        expect(isQuotaExhausted({ count: QUOTA_LIMIT - 1, windowStart: ago(1) }, NOW)).toBe(false);
    });

    test("refuses at the limit, not one past it", () => {
        expect(isQuotaExhausted({ count: QUOTA_LIMIT, windowStart: ago(1) }, NOW)).toBe(true);
    });

    test("lets the same visitor through once the window turns over", () => {
        const spent = { count: QUOTA_LIMIT, windowStart: ago(QUOTA_WINDOW_MS) };

        expect(isQuotaExhausted(spent, NOW)).toBe(false);
    });

    test("honours a limit passed in, so the ceiling is testable at 1", () => {
        expect(isQuotaExhausted({ count: 1, windowStart: ago(1) }, NOW, 1)).toBe(true);
        expect(isQuotaExhausted({ count: 0, windowStart: ago(1) }, NOW, 1)).toBe(false);
    });
});

describe("windowStartFor", () => {
    test("a new visitor's window opens now", () => {
        expect(windowStartFor(null, NOW)).toEqual(NOW);
    });

    test("a running window keeps its original start", () => {
        const start = ago(60_000);

        expect(windowStartFor({ count: 2, windowStart: start }, NOW)).toEqual(start);
    });

    /**
     * The new window opens at the request, not at the end of the old one. A
     * fixed window is what keeps this table free of per-scan timestamps, and
     * this is the arithmetic that makes it fixed.
     */
    test("an expired window reopens at the request rather than sliding", () => {
        const stale = { count: QUOTA_LIMIT, windowStart: ago(QUOTA_WINDOW_MS * 3) };

        expect(windowStartFor(stale, NOW)).toEqual(NOW);
    });
});

describe("describeQuota", () => {
    test("reports the full allowance to a visitor with no history", () => {
        expect(describeQuota(null, NOW)).toEqual({
            limit: QUOTA_LIMIT,
            used: 0,
            remaining: QUOTA_LIMIT,
            resetsAt: new Date(NOW.getTime() + QUOTA_WINDOW_MS).toISOString(),
        });
    });

    test("counts down inside a running window and dates the turnover from its start", () => {
        const start = ago(15 * 60_000);

        expect(describeQuota({ count: 4, windowStart: start }, NOW)).toEqual({
            limit: QUOTA_LIMIT,
            used: 4,
            remaining: QUOTA_LIMIT - 4,
            resetsAt: new Date(start.getTime() + QUOTA_WINDOW_MS).toISOString(),
        });
    });

    test("never reports a negative remainder, whatever the row says", () => {
        const overspent = { count: QUOTA_LIMIT + 5, windowStart: ago(1) };

        expect(describeQuota(overspent, NOW).remaining).toBe(0);
    });

    test("an expired window reads as a fresh allowance", () => {
        const stale = { count: QUOTA_LIMIT, windowStart: ago(QUOTA_WINDOW_MS + 1) };

        expect(describeQuota(stale, NOW)).toMatchObject({ used: 0, remaining: QUOTA_LIMIT });
    });
});
