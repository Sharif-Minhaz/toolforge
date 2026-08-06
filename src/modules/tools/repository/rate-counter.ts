import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    decideRateLimit,
    RATE_COUNT_CEILING,
    RATE_ROW_RETENTION_MS,
    RATE_WINDOW_MS,
    type RateSpend,
    type RateVerdict,
} from "../domain/rate-window";

/**
 * The throughput limit on a public execution path, shared by both studios.
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
 * point of a mock is that it answers quickly — so a read-then-write transaction
 * would roughly double the database work of every request, including every
 * request in a flood. A limiter that gets more expensive the harder it is pushed
 * is the wrong shape. `INSERT … ON CONFLICT DO UPDATE … RETURNING` is one round
 * trip, atomic on its own, and races correctly without a transaction because the
 * increment happens inside the statement.
 *
 * **A refusal, once known, is free to repeat.** See `blockedUntil` below.
 *
 * One table, `service_quota`, for every limit on this site that counts a caller
 * without naming one. Sharing it is safe — and cheaper than a table per tool —
 * because every key is a digest of a namespaced string, so two limits can never
 * land on one row. Getting that namespace wrong is the one way to break it,
 * which is why it is a required parameter rather than something with a default.
 */

/** The row says *whether*, never *who*. See `visitorHash` in each caller. */
function bucketKey(salt: string, namespace: string, bucket: string, value: string): string {
    return createHash("sha256").update(`${salt}:${namespace}:${bucket}:${value}`).digest("hex");
}

/**
 * Callers already known to be over their limit, and when each clears.
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
 *
 * Keyed by the same namespaced digest the rows are, so one process serving both
 * studios cannot confuse one caller's refusal for another's.
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

export type RateLimitOutcome<Bucket extends string> = {
    readonly verdict: RateVerdict<Bucket>;
    /** True when a fresh window opened, which is what schedules the sweep. */
    readonly windowOpened: boolean;
};

/** One counter to spend: which bucket it is, what it is keyed on, and its ceiling. */
export type RateCounter<Bucket extends string> = {
    readonly bucket: Bucket;
    readonly value: string;
    readonly limit: number;
};

export type RateCounterOptions<Bucket extends string> = {
    /**
     * Mixed into every digest. A secret, because without one a table of SHA-256
     * digests of IPv4 addresses is reversible by brute force in seconds, there
     * being only four billion of them.
     */
    readonly salt: string;
    /** Distinguishes this limit from every other one sharing the table. */
    readonly namespace: string;
    /**
     * Exactly two, and the pair is deliberate rather than a limitation: the
     * statement below writes a fixed two-row `VALUES`, which is the shape that
     * has been serving `/m/<key>/…` in production. A variadic version would have
     * to build the row list dynamically — `UNNEST` over parameter arrays, or
     * interpolated SQL — and neither is reachable from `bun test`, which has no
     * Postgres. Both callers meter a caller and a target, so widening this would
     * be trading a proven statement for one nothing here can exercise.
     */
    readonly counters: readonly [RateCounter<Bucket>, RateCounter<Bucket>];
    /** Reported when the statement returns nothing at all. */
    readonly fallback: { readonly bucket: Bucket; readonly limit: number };
    readonly windowMs?: number;
    readonly now?: Date;
};

/**
 * Counts one request against each named counter and says whether it may proceed.
 *
 * Returns `null` when it could not run, which every caller must treat as a
 * refusal. An unmetered public execution path is a free, scriptable way to spend
 * a deployment's function budget, so this is one of the few things on this site
 * that fails closed — see each studio's own wrapper for why that is the right
 * direction there specifically.
 */
export async function spendRateCounters<Bucket extends string>(
    options: RateCounterOptions<Bucket>,
): Promise<RateLimitOutcome<Bucket> | null> {
    const { salt, namespace, counters, fallback } = options;
    const windowMs = options.windowMs ?? RATE_WINDOW_MS;
    const now = options.now ?? new Date();

    const keys = counters.map((counter) => ({
        ...counter,
        key: bucketKey(salt, namespace, counter.bucket, counter.value),
    }));

    const nowMs = now.getTime();
    const blocked = keys.find((entry) => isStillBlocked(entry.key, nowMs));

    if (blocked !== undefined) {
        const until = blockedUntil.get(blocked.key) ?? nowMs + windowMs;

        return {
            // Reconstructed rather than re-read: the count is not known here,
            // only that it was over. `Number.MAX_SAFE_INTEGER` reports zero
            // headroom, which is exactly what is true.
            verdict: decideRateLimit(
                [
                    {
                        bucket: blocked.bucket,
                        limit: blocked.limit,
                        count: Number.MAX_SAFE_INTEGER,
                        windowStart: new Date(until - windowMs),
                    },
                ],
                now,
                fallback,
                windowMs,
            ),
            windowOpened: false,
        };
    }

    const cutoff = new Date(nowMs - windowMs);

    try {
        // Both counters in one statement. The two keys are different digests of
        // different namespaced strings, so they can never collide inside one
        // `VALUES` — which is the one thing Postgres refuses to do with
        // `ON CONFLICT`.
        const rows = await prisma.$queryRaw<
            { visitor_hash: string; count: number; window_start: Date }[]
        >`
            INSERT INTO service_quota (visitor_hash, count, window_start, updated_at)
            VALUES (${keys[0].key}, 1, ${now}, ${now}), (${keys[1].key}, 1, ${now}, ${now})
            ON CONFLICT (visitor_hash) DO UPDATE SET
                count = CASE
                    WHEN service_quota.window_start <= ${cutoff} THEN 1
                    ELSE LEAST(service_quota.count + 1, ${RATE_COUNT_CEILING}::int)
                END,
                window_start = CASE
                    WHEN service_quota.window_start <= ${cutoff} THEN ${now}
                    ELSE service_quota.window_start
                END,
                updated_at = ${now}
            RETURNING visitor_hash, count, window_start
        `;

        const spends: RateSpend<Bucket>[] = [];
        let windowOpened = false;

        for (const row of rows) {
            const entry = keys.find((candidate) => candidate.key === row.visitor_hash);

            if (entry === undefined) {
                continue;
            }

            spends.push({
                bucket: entry.bucket,
                limit: entry.limit,
                count: row.count,
                windowStart: row.window_start,
            });

            if (row.count === 1) {
                windowOpened = true;
            }
        }

        const verdict = decideRateLimit(spends, now, fallback, windowMs);

        if (!verdict.allowed) {
            const refused = keys.find((entry) => entry.bucket === verdict.bucket);

            if (refused !== undefined) {
                rememberBlock(refused.key, verdict.resetsAt * 1_000);
            }
        }

        return { verdict, windowOpened };
    } catch (caught) {
        logEvent("error", "rate_counter.spend_failed", {
            namespace,
            error: describeError(caught),
        });

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
 * Called from a route handler's `after()`, and only when a fresh window
 * opened — at most once a minute per active server, off the response path, and
 * usually deleting nothing. A sweep is not a limiter: running it too often is
 * merely wasteful and missing one is caught by the next request, so unlike a
 * counter it is safe to trigger from whatever process happens to notice.
 */
export async function sweepRateCounterRows(now = new Date()): Promise<void> {
    try {
        await prisma.serviceQuota.deleteMany({
            where: { windowStart: { lt: new Date(now.getTime() - RATE_ROW_RETENTION_MS) } },
        });
    } catch (caught) {
        logEvent("warn", "rate_counter.sweep_failed", { error: describeError(caught) });
    }
}
