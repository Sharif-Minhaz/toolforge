import {
    describeQuota as describeWindow,
    hasWindowExpired as windowExpired,
    isQuotaExhausted as windowExhausted,
} from "@/modules/tools/domain/quota-window";
import type { QuotaRow, QuotaState } from "@/modules/tools/types";

import { CREATE_QUOTA_LIMIT, CREATE_QUOTA_WINDOW_MS } from "./constants";

/**
 * The studio's creation allowance, bound to the studio's window.
 *
 * The arithmetic lives in `tools/domain/quota-window.ts`, shared with the Port
 * Scanner and the Mock Server Studio, along with the reasoning for a fixed
 * window over a sliding one. What is specific to this module is *why* the limit
 * exists at all.
 *
 * A JSON server is free, needs no account, owns a publicly callable address, and
 * — unlike a mock server — will happily **store whatever is posted to it**. That
 * makes it a fine thing to offer a developer and an obvious thing to script into
 * free hosting for somebody else's data. The five-per-browser cap does not stop
 * it: the cookie belongs to the caller, and a script does not send one. This
 * does, and it is why `spendCreateQuota` refuses when it cannot run rather than
 * falling open, which is the opposite of how every other degradation on this
 * site behaves.
 */

export function hasCreateWindowExpired(row: QuotaRow, now: Date): boolean {
    return windowExpired(row, now, CREATE_QUOTA_WINDOW_MS);
}

export function isCreateQuotaExhausted(
    row: QuotaRow | null,
    now: Date,
    limit = CREATE_QUOTA_LIMIT,
): boolean {
    return windowExhausted(row, now, limit, CREATE_QUOTA_WINDOW_MS);
}

export function describeCreateQuota(
    row: QuotaRow | null,
    now: Date,
    limit = CREATE_QUOTA_LIMIT,
): QuotaState {
    return describeWindow(row, now, limit, CREATE_QUOTA_WINDOW_MS);
}
