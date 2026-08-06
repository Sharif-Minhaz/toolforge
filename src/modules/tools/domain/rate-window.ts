/**
 * The throughput arithmetic behind a public execution path — `/m/<key>/…` for
 * the Mock Server Studio, `/j/<key>/…` for the JSON Server Studio.
 *
 * A different problem from the allowances in each module's `domain/quota.ts`,
 * and worth keeping apart from them. Those meter *actions a person takes* —
 * creating a server, making an outbound call — where a handful an hour is
 * generous. This meters *a program calling an API*, where a hundred a minute is
 * ordinary and the thing being defended against is a loop.
 *
 * The loop is not hypothetical and is not usually malice. A `useEffect` with a
 * dependency that changes on every render will call its mock as fast as the
 * network allows, from one browser tab, for as long as the tab is open. That is
 * the single most likely way this deployment gets hurt, and it is also the case
 * where the limit has to *recover quickly*: the developer fixes the loop and
 * expects their server back, not a lockout that outlives the mistake.
 *
 * Hence a one-minute window rather than the hourly one everything else here
 * uses. Two consequences fall out and both are deliberate:
 *
 * - **The ceiling is per minute, so it also bounds the hour** — 120 a minute is
 *   7,200 an hour, which is a fine ceiling for a free service and far above what
 *   interactive development produces.
 * - **A refusal clears in under a minute.** Compare a creation limit, where
 *   being refused for an hour is the correct outcome because creating eight
 *   servers an hour is not something a person does by accident.
 *
 * The usual fixed-window caveat from `quota-window.ts` applies: a caller can
 * spend the tail of one window and the head of the next, so the true short-term
 * ceiling is twice the limit. For a limit whose job is to stop a runaway rather
 * than to meter a paid resource, that is fine and is written down here rather
 * than discovered.
 *
 * Every bound is a parameter. Each caller binds its own in its module's
 * `domain/rate-limit.ts`, so a limit is still named once and in one place — and
 * the bucket name stays a literal union per caller, because a plain `string`
 * would let a typo silently meter nothing.
 */

export const RATE_WINDOW_MS = 60 * 1_000;

/**
 * A refused request still spends, which is the rule the Port Scanner
 * established: a refusal that costs nothing is a free retry loop, and retrying
 * is exactly what a runaway does. That makes the counter unbounded in principle,
 * so it is clamped well below `INTEGER`'s ceiling rather than left to overflow
 * on the one day somebody really does send two billion requests in a minute.
 */
export const RATE_COUNT_CEILING = 1_000_000_000;

/**
 * How long a quota row outlives its window before a sweep may remove it.
 *
 * A day, which is far past both this one-minute window and the hourly windows
 * each studio's `quota.ts` uses, so a sweep can never hand back allowance that
 * is still live. The rows are keyed by digest and reset in place, so this bounds
 * the table by *distinct callers seen in a day* rather than by requests.
 */
export const RATE_ROW_RETENTION_MS = 24 * 60 * 60 * 1_000;

/** One counter as it stands *after* this request was counted into it. */
export type RateSpend<Bucket extends string> = {
    readonly bucket: Bucket;
    readonly limit: number;
    readonly count: number;
    readonly windowStart: Date;
};

export type RateVerdict<Bucket extends string> = {
    readonly allowed: boolean;
    /** Which counter refused, or the tightest one when the request was allowed. */
    readonly bucket: Bucket;
    readonly limit: number;
    readonly remaining: number;
    /** Epoch **seconds**, which is the unit every rate-limit header wants. */
    readonly resetsAt: number;
    /** Never below 1: a `Retry-After: 0` reads as "immediately" and invites a retry storm. */
    readonly retryAfterSeconds: number;
};

/**
 * Turns the counters into an answer and the headers that explain it.
 *
 * Reports the bucket with the *least* headroom rather than the first one,
 * because the honest answer to "how much have I got left" is the smallest of
 * them — reporting the roomier counter would tell a caller they have a thousand
 * requests in hand a moment before the other one refuses them.
 *
 * `fallback` is what to report when there are no counters at all, which happens
 * only when the statement returned nothing. It names the bucket a caller is
 * actually asking about, so an empty answer still reads as a real allowance.
 */
export function decideRateLimit<Bucket extends string>(
    spends: readonly RateSpend<Bucket>[],
    now: Date,
    fallback: { readonly bucket: Bucket; readonly limit: number },
    windowMs: number = RATE_WINDOW_MS,
): RateVerdict<Bucket> {
    let tightest: RateVerdict<Bucket> | null = null;

    for (const spend of spends) {
        const endsAt = spend.windowStart.getTime() + windowMs;
        // The count already includes this request, so landing exactly on the
        // limit is the last allowed one rather than the first refused one.
        const verdict: RateVerdict<Bucket> = {
            allowed: spend.count <= spend.limit,
            bucket: spend.bucket,
            limit: spend.limit,
            remaining: Math.max(0, spend.limit - spend.count),
            resetsAt: Math.ceil(endsAt / 1_000),
            retryAfterSeconds: retryAfter(endsAt, now, windowMs),
        };

        if (tightest === null || isTighter(verdict, tightest)) {
            tightest = verdict;
        }
    }

    return (
        tightest ?? {
            allowed: true,
            bucket: fallback.bucket,
            limit: fallback.limit,
            remaining: fallback.limit,
            resetsAt: Math.ceil((now.getTime() + windowMs) / 1_000),
            retryAfterSeconds: Math.ceil(windowMs / 1_000),
        }
    );
}

/** A refusal always outranks an allowance; between two of a kind, less headroom wins. */
function isTighter<Bucket extends string>(
    candidate: RateVerdict<Bucket>,
    held: RateVerdict<Bucket>,
): boolean {
    if (candidate.allowed !== held.allowed) {
        return !candidate.allowed;
    }

    return candidate.remaining < held.remaining;
}

function retryAfter(endsAt: number, now: Date, windowMs: number): number {
    const seconds = Math.ceil((endsAt - now.getTime()) / 1_000);

    // Clamped at both ends. Below 1 because a zero invites an immediate retry,
    // and above the window because a row written by a host whose clock ran fast
    // must not park a caller for longer than the window can possibly last.
    return Math.min(Math.max(1, seconds), Math.ceil(windowMs / 1_000));
}
