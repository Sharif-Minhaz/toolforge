import type { QuotaRow, QuotaState } from "../types";

/**
 * Fixed-window rate-limit arithmetic, kept pure so the limit that makes a tool
 * safe to host is unit-tested rather than trusted to a query.
 *
 * A fixed window rather than a sliding one, deliberately: a sliding window
 * needs every timestamp kept, and a per-request history of who did what when is
 * a log this site has no business holding. A fixed window needs one counter and
 * one instant, so the row says "ten scans since 14:00" and nothing about which
 * ten.
 *
 * The cost is the usual one — a visitor can spend the tail of one window and
 * the head of the next back to back, so the real short-term ceiling is twice
 * the limit. For a limit whose purpose is to slow abuse rather than to meter a
 * paid resource, that is an acceptable trade and worth writing down rather than
 * discovering.
 *
 * Lifted out of the Port Scanner when the Mock Server Studio needed the same
 * arithmetic for workspace creation. Every bound is a parameter here; each
 * caller binds its own in its module's `domain/quota.ts`, so a limit is still
 * named once and in one place.
 */

/** Where the window containing `now` began, given the row we have (or none). */
export function windowStartFor(row: QuotaRow | null, now: Date, windowMs: number): Date {
    if (row === null || hasWindowExpired(row, now, windowMs)) {
        return now;
    }

    return row.windowStart;
}

export function hasWindowExpired(row: QuotaRow, now: Date, windowMs: number): boolean {
    return now.getTime() - row.windowStart.getTime() >= windowMs;
}

/** The count that applies to `now` — an expired window is already back to zero. */
export function effectiveCount(row: QuotaRow | null, now: Date, windowMs: number): number {
    if (row === null || hasWindowExpired(row, now, windowMs)) {
        return 0;
    }

    return row.count;
}

export function isQuotaExhausted(
    row: QuotaRow | null,
    now: Date,
    limit: number,
    windowMs: number,
): boolean {
    return effectiveCount(row, now, windowMs) >= limit;
}

/**
 * What the UI shows. `resetsAt` is an instant rather than a duration because
 * the report crosses a Server Action boundary and a countdown computed on the
 * server is wrong by the time it is painted.
 */
export function describeQuota(
    row: QuotaRow | null,
    now: Date,
    limit: number,
    windowMs: number,
): QuotaState {
    const used = effectiveCount(row, now, windowMs);
    const start = windowStartFor(row, now, windowMs);

    return {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        resetsAt: new Date(start.getTime() + windowMs).toISOString(),
    };
}
