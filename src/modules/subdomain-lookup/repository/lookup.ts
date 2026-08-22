import "server-only";

import { after } from "next/server";

import { logEvent } from "@/modules/observability/domain/logger";

import { MAX_RECORDS } from "../domain/constants";
import { parseSubdomainIndex } from "../domain/parse";
import { summarize } from "../domain/summary";
import { fetchSubdomainIndex } from "./crt-name";
import { isLookupQuotaConfigured, spendLookupQuota, sweepLookupQuotaRows } from "./quota";
import type { LookupAllowance, LookupResult } from "../types";

/**
 * One lookup, and the gates it passes on the way.
 *
 * Shared by the Server Action and the MCP adapter rather than living in either,
 * because the counter it spends is not about who is asking — it is about this
 * deployment's share of the upstream's free allowance, and a second entry point
 * that skipped it would spend that budget without counting it.
 *
 * The order is the argument:
 *
 * 1. **The apex is already read** by the time this is called, by the pure code
 *    in `domain/apex.ts`. A typo must not cost a database write or a packet.
 * 2. **Quota before the network**, because it is the only gate that bounds
 *    *volume*. Everything above it refuses one bad request; this is what refuses
 *    the thousandth good one. It fails closed.
 * 3. **Two size caps inside the fetch and the parse**, in bytes and then in
 *    records.
 *
 * The allowance is spent whether or not names come back. A lookup that failed
 * and cost nothing is a free retry loop, and retrying is exactly what an abuser
 * does.
 */

export type LookupRun = {
    readonly apex: string;
    readonly narrowedFrom: string | null;
    /**
     * What the per-caller counter is keyed on: a visitor's address from the
     * page, or a literal for a caller that has no address here. Never a value a
     * caller chooses.
     */
    readonly callerKey: string;
    readonly now?: Date;
};

export async function runSubdomainLookup(run: LookupRun): Promise<LookupResult> {
    const now = run.now ?? new Date();

    if (!isLookupQuotaConfigured()) {
        logEvent("warn", "subdomain_lookup.not_configured");

        return { ok: false, reason: "not_configured" };
    }

    const spent = await spendLookupQuota(run.callerKey, now);

    if (spent === null) {
        return { ok: false, reason: "not_configured" };
    }

    const allowance: LookupAllowance = {
        remaining: spent.verdict.remaining,
        resetsAt: spent.verdict.resetsAt,
    };

    if (!spent.verdict.allowed) {
        return { ok: false, reason: "rate_limited", allowance };
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened — at most
        // once a window per active server, usually deleting nothing.
        after(() => sweepLookupQuotaRows());
    }

    const fetched = await fetchSubdomainIndex(run.apex);

    if (!fetched.ok) {
        return { ok: false, reason: fetched.reason, allowance };
    }

    const parsed = parseSubdomainIndex(fetched.body, run.apex, MAX_RECORDS);

    if (parsed.truncated) {
        // A reader who asked for a domain and got a prefix of it is something
        // worth being able to find in a log afterwards.
        logEvent("warn", "subdomain_lookup.truncated", {
            apex: run.apex,
            returned: parsed.returned,
            kept: parsed.records.length,
        });
    }

    return {
        ok: true,
        apex: run.apex,
        narrowedFrom: run.narrowedFrom,
        records: parsed.records,
        summary: summarize(parsed, run.apex, now),
        fetchedAt: now.toISOString(),
        allowance,
    };
}
