import {
    describeQuota as describeWindow,
    effectiveCount as countInWindow,
    hasWindowExpired as windowExpired,
    isQuotaExhausted as windowExhausted,
    windowStartFor as startOfWindow,
} from "@/modules/tools/domain/quota-window";
import type { QuotaRow, QuotaState } from "@/modules/tools/types";

import { QUOTA_LIMIT, QUOTA_WINDOW_MS } from "./constants";

/**
 * This tool's allowance, bound to this tool's window.
 *
 * The arithmetic itself lives in `tools/domain/quota-window.ts`, where the Mock
 * Server Studio reads it too, and where the reasoning for a fixed window over a
 * sliding one is written down. What stays here is the binding: every caller in
 * this module asks about *the port scanner's* limit without naming the number,
 * so the number is still named once.
 */

/** Where the window containing `now` began, given the row we have (or none). */
export function windowStartFor(row: QuotaRow | null, now: Date): Date {
    return startOfWindow(row, now, QUOTA_WINDOW_MS);
}

export function hasWindowExpired(row: QuotaRow, now: Date): boolean {
    return windowExpired(row, now, QUOTA_WINDOW_MS);
}

/** The count that applies to `now` — an expired window is already back to zero. */
export function effectiveCount(row: QuotaRow | null, now: Date): number {
    return countInWindow(row, now, QUOTA_WINDOW_MS);
}

export function isQuotaExhausted(row: QuotaRow | null, now: Date, limit = QUOTA_LIMIT): boolean {
    return windowExhausted(row, now, limit, QUOTA_WINDOW_MS);
}

/**
 * What the UI shows. `resetsAt` is an instant rather than a duration because
 * the report crosses a Server Action boundary and a countdown computed on the
 * server is wrong by the time it is painted.
 */
export function describeQuota(row: QuotaRow | null, now: Date, limit = QUOTA_LIMIT): QuotaState {
    return describeWindow(row, now, limit, QUOTA_WINDOW_MS);
}
