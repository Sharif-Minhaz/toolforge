import { QUOTA_LIMIT, QUOTA_WINDOW_MS } from "./constants";
import type { QuotaState } from "../types";

/**
 * The rolling-window arithmetic, kept pure so the limit that makes this tool
 * safe to host is unit-tested rather than trusted to a query.
 *
 * A fixed window rather than a sliding one, deliberately: a sliding window
 * needs every timestamp kept, and keeping a per-scan history of who scanned
 * when is a log this site has no business holding. A fixed window needs one
 * counter and one instant, so the row says "ten scans since 14:00" and nothing
 * about which ten.
 *
 * The cost is the usual one — a visitor can spend the tail of one window and
 * the head of the next back to back, so the real short-term ceiling is twice
 * the limit. For a tool whose purpose is to slow abuse rather than to meter a
 * paid resource, that is an acceptable trade and worth writing down rather than
 * discovering.
 */

export type QuotaRow = {
    readonly count: number;
    readonly windowStart: Date;
};

/** Where the window containing `now` began, given the row we have (or none). */
export function windowStartFor(row: QuotaRow | null, now: Date): Date {
    if (row === null || hasWindowExpired(row, now)) {
        return now;
    }

    return row.windowStart;
}

export function hasWindowExpired(row: QuotaRow, now: Date): boolean {
    return now.getTime() - row.windowStart.getTime() >= QUOTA_WINDOW_MS;
}

/** The count that applies to `now` — an expired window is already back to zero. */
export function effectiveCount(row: QuotaRow | null, now: Date): number {
    if (row === null || hasWindowExpired(row, now)) {
        return 0;
    }

    return row.count;
}

export function isQuotaExhausted(row: QuotaRow | null, now: Date, limit = QUOTA_LIMIT): boolean {
    return effectiveCount(row, now) >= limit;
}

/**
 * What the UI shows. `resetsAt` is an instant rather than a duration because
 * the report crosses a Server Action boundary and a countdown computed on the
 * server is wrong by the time it is painted.
 */
export function describeQuota(row: QuotaRow | null, now: Date, limit = QUOTA_LIMIT): QuotaState {
    const used = effectiveCount(row, now);
    const start = windowStartFor(row, now);

    return {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        resetsAt: new Date(start.getTime() + QUOTA_WINDOW_MS).toISOString(),
    };
}
