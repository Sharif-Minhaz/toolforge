import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    decideRateLimit,
    MOCK_RATE_COUNT_CEILING,
    MOCK_RATE_ROW_RETENTION_MS,
    MOCK_RATE_WINDOW_MS,
    type RateBucket,
    type RateSpend,
    type RateVerdict,
} from "../domain/rate-limit";
import { isMockQuotaConfigured } from "./config";

/**
 * The throughput limit on the public execution path.
 *
 * Three properties this had to have, and each one rules out an easier design.
 *
 * **In Postgres, so it survives a cold start and is shared across instances.**
 * A per-process counter resets whenever a serverless instance is recycled and
 * each instance counts separately, which makes it a limit in name only. That
 * rule is written down in `CLAUDE.md` and it is the reason the counters below
 * are rows rather than a `Map`.
 *
 * **One statement, not a transaction.** This runs on the hot path — the whole
 * point of a mock is that it answers quickly — so the read-then-write
 * transaction `spendCreateQuota` uses would roughly double the database work of
 * every request, including every request in a flood. A limiter that gets more
 * expensive the harder it is pushed is the wrong shape. `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING` is one round trip, atomic on its own, and races correctly
 * without a transaction because the increment happens inside the statement.
 *
 * **A refusal, once known, is free to repeat.** See `blockedUntil` below.
 */

/** Same salt, same reasoning as `quota.ts`: the row says *whether*, never *who*. */
function bucketKey(bucket: RateBucket, value: string): string {
    const salt = process.env.MOCK_IP_SALT ?? "";

    // Namespaced, because `mock_quota` is shared with the creation and outbound
    // allowances and a collision between two limits would meter neither.
    return createHash("sha256").update(`${salt}:serve:${bucket}:${value}`).digest("hex");
}

/**
 * Addresses and servers already known to be over their limit, and when each
 * clears.
 *
 * This is a **cache of a refusal**, not the limit — a distinction worth being
 * exact about, because an in-memory counter *would* be the banned thing. It can
 * only ever refuse more than Postgres would, never less: within one window a
 * count only goes up, so once the database has said "over until T", no instance
 * can be under before T. Losing the map on a cold start therefore costs nothing
 * but a round trip.
 *
 * It exists for the runaway loop specifically. A `useEffect` calling its mock
 * thousands of times a second is refused after the first hundred and twenty —
 * and without this, each of those thousands of refusals would still cost a
 * database write. With it, they cost a `Map` lookup.
 */
const blockedUntil = new Map<string, number>();

/** Bounded, because the keys are attacker-influenced. It is a cache: dropping it is free. */
const MAX_BLOCKED_ENTRIES = 10_000;

function rememberBlock(key: string, untilMs: number): void {
    if (blockedUntil.size >= MAX_BLOCKED_ENTRIES) {
        const now = Date.now();

        for (const [held, expiry] of blockedUntil) {
            if (expiry <= now) {
                blockedUntil.delete(held);
            }
        }

        // Still full means every entry is live, so there is nothing to expire
        // and the only bounded answer is to start again.
        if (blockedUntil.size >= MAX_BLOCKED_ENTRIES) {
            blockedUntil.clear();
        }
    }

    blockedUntil.set(key, untilMs);
}

function isStillBlocked(key: string, nowMs: number): boolean {
    const until = blockedUntil.get(key);

    if (until === undefined) {
        return false;
    }

    if (until <= nowMs) {
        blockedUntil.delete(key);

        return false;
    }

    return true;
}

export type RateLimitOutcome = {
    readonly verdict: RateVerdict;
    /** True when a fresh window opened, which is what schedules the sweep. */
    readonly windowOpened: boolean;
};

/**
 * Counts one request against the calling address and the server it named, and
 * says whether it may proceed.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and an
 * unmetered public execution path is a free, scriptable way to spend this
 * deployment's function budget. In practice the two failures coincide: the same
 * database is what `serveMockRequest` needs to find an endpoint at all, so a
 * deployment that cannot run this statement had nothing to serve anyway.
 */
export async function spendServeQuota(
    address: string,
    serverKey: string,
    now = new Date(),
): Promise<RateLimitOutcome | null> {
    if (!isMockQuotaConfigured()) {
        logEvent("error", "mock_server.serve_quota_not_configured");

        return null;
    }

    const keys: ReadonlyArray<{ bucket: RateBucket; key: string }> = [
        { bucket: "address", key: bucketKey("address", address) },
        { bucket: "server", key: bucketKey("server", serverKey) },
    ];

    const nowMs = now.getTime();
    const blocked = keys.find((entry) => isStillBlocked(entry.key, nowMs));

    if (blocked !== undefined) {
        const until = blockedUntil.get(blocked.key) ?? nowMs + MOCK_RATE_WINDOW_MS;

        return {
            // Reconstructed rather than re-read: the count is not known here,
            // only that it was over. `Number.MAX_SAFE_INTEGER` reports zero
            // headroom, which is exactly what is true.
            verdict: decideRateLimit(
                [
                    {
                        bucket: blocked.bucket,
                        count: Number.MAX_SAFE_INTEGER,
                        windowStart: new Date(until - MOCK_RATE_WINDOW_MS),
                    },
                ],
                now,
            ),
            windowOpened: false,
        };
    }

    const cutoff = new Date(nowMs - MOCK_RATE_WINDOW_MS);

    try {
        // Both counters in one statement. The two keys are different digests of
        // different namespaces, so they can never collide inside one `VALUES` —
        // which is the one thing Postgres refuses to do with `ON CONFLICT`.
        const rows = await prisma.$queryRaw<
            { visitor_hash: string; count: number; window_start: Date }[]
        >`
            INSERT INTO mock_quota (visitor_hash, count, window_start, updated_at)
            VALUES (${keys[0].key}, 1, ${now}, ${now}), (${keys[1].key}, 1, ${now}, ${now})
            ON CONFLICT (visitor_hash) DO UPDATE SET
                count = CASE
                    WHEN mock_quota.window_start <= ${cutoff} THEN 1
                    ELSE LEAST(mock_quota.count + 1, ${MOCK_RATE_COUNT_CEILING}::int)
                END,
                window_start = CASE
                    WHEN mock_quota.window_start <= ${cutoff} THEN ${now}
                    ELSE mock_quota.window_start
                END,
                updated_at = ${now}
            RETURNING visitor_hash, count, window_start
        `;

        const spends: RateSpend[] = [];
        let windowOpened = false;

        for (const row of rows) {
            const entry = keys.find((candidate) => candidate.key === row.visitor_hash);

            if (entry === undefined) {
                continue;
            }

            spends.push({
                bucket: entry.bucket,
                count: row.count,
                windowStart: row.window_start,
            });

            if (row.count === 1) {
                windowOpened = true;
            }
        }

        const verdict = decideRateLimit(spends, now);

        if (!verdict.allowed) {
            const refused = keys.find((entry) => entry.bucket === verdict.bucket);

            if (refused !== undefined) {
                rememberBlock(refused.key, verdict.resetsAt * 1_000);
            }
        }

        return { verdict, windowOpened };
    } catch (caught) {
        logEvent("error", "mock_server.serve_quota_failed", { error: describeError(caught) });

        return null;
    }
}

/**
 * Drops quota rows whose window ended a day ago.
 *
 * Rows are keyed by digest and reset in place, so the table is bounded by
 * *distinct callers*, not by requests — but a public address seen once and never
 * again would otherwise stay forever. The retention is far past every window
 * this table holds, so a sweep can never hand back allowance that is still live.
 *
 * Called from the route handler's `after()`, and only when a fresh window
 * opened — at most once a minute per active server, off the response path, and
 * usually deleting nothing. A sweep is not a limiter: running it too often is
 * merely wasteful and missing one is caught by the next request, so unlike a
 * counter it is safe to trigger from whatever process happens to notice.
 */
export async function sweepQuotaRows(now = new Date()): Promise<void> {
    try {
        await prisma.mockQuota.deleteMany({
            where: { windowStart: { lt: new Date(now.getTime() - MOCK_RATE_ROW_RETENTION_MS) } },
        });
    } catch (caught) {
        logEvent("warn", "mock_server.quota_sweep_failed", { error: describeError(caught) });
    }
}
