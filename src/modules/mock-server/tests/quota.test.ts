import { describe, expect, test } from "bun:test";

import { CREATE_QUOTA_LIMIT, CREATE_QUOTA_WINDOW_MS } from "@/modules/mock-server/domain/constants";
import {
    describeCreateQuota,
    hasCreateWindowExpired,
    isCreateQuotaExhausted,
} from "@/modules/mock-server/domain/quota";

/** Frozen, because a limit tested against a real clock is a flaky limit. */
const NOW = new Date("2026-08-05T09:00:00.000Z");

function ago(ms: number): Date {
    return new Date(NOW.getTime() - ms);
}

describe("hasCreateWindowExpired", () => {
    test("a window inside the period is still running", () => {
        expect(
            hasCreateWindowExpired({ count: 2, windowStart: ago(CREATE_QUOTA_WINDOW_MS - 1) }, NOW),
        ).toBe(false);
    });

    test("a window exactly one period old has turned over", () => {
        expect(
            hasCreateWindowExpired({ count: 2, windowStart: ago(CREATE_QUOTA_WINDOW_MS) }, NOW),
        ).toBe(true);
    });
});

describe("isCreateQuotaExhausted", () => {
    test("lets a caller with no history through", () => {
        expect(isCreateQuotaExhausted(null, NOW)).toBe(false);
    });

    test("lets a caller through below the limit", () => {
        expect(
            isCreateQuotaExhausted({ count: CREATE_QUOTA_LIMIT - 1, windowStart: ago(1) }, NOW),
        ).toBe(false);
    });

    test("refuses at the limit, not one past it", () => {
        expect(
            isCreateQuotaExhausted({ count: CREATE_QUOTA_LIMIT, windowStart: ago(1) }, NOW),
        ).toBe(true);
    });

    test("lets the same caller through once the window turns over", () => {
        const spent = { count: CREATE_QUOTA_LIMIT, windowStart: ago(CREATE_QUOTA_WINDOW_MS) };

        expect(isCreateQuotaExhausted(spent, NOW)).toBe(false);
    });

    test("honours a limit passed in, so the ceiling is testable at 1", () => {
        expect(isCreateQuotaExhausted({ count: 1, windowStart: ago(1) }, NOW, 1)).toBe(true);
        expect(isCreateQuotaExhausted({ count: 0, windowStart: ago(1) }, NOW, 1)).toBe(false);
    });
});

describe("describeCreateQuota", () => {
    test("reports the full allowance to a caller with no history", () => {
        expect(describeCreateQuota(null, NOW)).toEqual({
            limit: CREATE_QUOTA_LIMIT,
            used: 0,
            remaining: CREATE_QUOTA_LIMIT,
            resetsAt: new Date(NOW.getTime() + CREATE_QUOTA_WINDOW_MS).toISOString(),
        });
    });

    /** Fixed window: the turnover is dated from the start, not from now. */
    test("dates the turnover from the window's own start", () => {
        const start = ago(20 * 60_000);

        expect(describeCreateQuota({ count: 3, windowStart: start }, NOW)).toEqual({
            limit: CREATE_QUOTA_LIMIT,
            used: 3,
            remaining: CREATE_QUOTA_LIMIT - 3,
            resetsAt: new Date(start.getTime() + CREATE_QUOTA_WINDOW_MS).toISOString(),
        });
    });

    test("never reports a negative remainder, whatever the row says", () => {
        const overspent = { count: CREATE_QUOTA_LIMIT + 3, windowStart: ago(1) };

        expect(describeCreateQuota(overspent, NOW).remaining).toBe(0);
    });

    test("an expired window reads as a fresh allowance", () => {
        const stale = { count: CREATE_QUOTA_LIMIT, windowStart: ago(CREATE_QUOTA_WINDOW_MS + 1) };

        expect(describeCreateQuota(stale, NOW)).toMatchObject({
            used: 0,
            remaining: CREATE_QUOTA_LIMIT,
        });
    });

    test("resetsAt crosses the action boundary as a string", () => {
        expect(typeof describeCreateQuota(null, NOW).resetsAt).toBe("string");
    });
});
