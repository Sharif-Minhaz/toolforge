/**
 * The throughput limit on the public execution path, `/m/<key>/…`.
 *
 * A different problem from the two allowances in `quota.ts`, and worth keeping
 * apart from them. Those meter *actions a person takes* — creating a workspace,
 * making an outbound call — where a handful an hour is generous. This meters
 * *a program calling an API*, where a hundred a minute is ordinary and the thing
 * being defended against is a loop.
 *
 * The loop is not hypothetical and is not usually malice. A `useEffect` with a
 * dependency that changes on every render will call its mock as fast as the
 * network allows, from one browser tab, for as long as the tab is open. That is
 * the single most likely way this deployment gets hurt, and it is also the case
 * where the limit has to *recover quickly*: the developer fixes the loop and
 * expects their mock back, not a lockout that outlives the mistake.
 *
 * Hence a one-minute window rather than the hourly one everything else here
 * uses. Two consequences fall out and both are deliberate:
 *
 * - **The ceiling is per minute, so it also bounds the hour** — 120 a minute is
 *   7,200 an hour, which is a fine ceiling for a free service and far above what
 *   interactive development produces.
 * - **A refusal clears in under a minute.** Compare the creation limit, where
 *   being refused for an hour is the correct outcome because creating eight
 *   workspaces an hour is not something a person does by accident.
 *
 * The usual fixed-window caveat from `tools/domain/quota-window.ts` applies:
 * a caller can spend the tail of one window and the head of the next, so the
 * true short-term ceiling is twice the limit. For a limit whose job is to stop a
 * runaway rather than to meter a paid resource, that is fine and is written down
 * here rather than discovered.
 */

export const MOCK_RATE_WINDOW_MS = 60 * 1_000;

/**
 * Per calling address, per minute.
 *
 * Two a second sustained. A test suite, a hot-reloading front end and a Postman
 * collection run all sit comfortably under it; a render loop does not.
 */
export const MOCK_RATE_LIMIT_PER_ADDRESS = 120;

/**
 * Per server key, per minute.
 *
 * Ten times the per-address limit, so a mock genuinely shared by a team or a CI
 * fleet is never refused by this bound before the per-address one bites — and a
 * flood spread across many addresses still meets a ceiling, which is the only
 * thing the per-address limit cannot do.
 */
export const MOCK_RATE_LIMIT_PER_SERVER = 1_200;

/**
 * A refused request still spends, which is the rule the Port Scanner
 * established: a refusal that costs nothing is a free retry loop, and retrying
 * is exactly what a runaway does. That makes the counter unbounded in principle,
 * so it is clamped well below `INTEGER`'s ceiling rather than left to overflow
 * on the one day somebody really does send two billion requests in a minute.
 */
export const MOCK_RATE_COUNT_CEILING = 1_000_000_000;

/**
 * How long a quota row outlives its window before a sweep may remove it.
 *
 * A day, which is far past both this one-minute window and the hourly windows in
 * `quota.ts`, so a sweep can never hand back allowance that is still live. The
 * rows are keyed by digest and reset in place, so this bounds the table by
 * *distinct callers seen in a day* rather than by requests.
 */
export const MOCK_RATE_ROW_RETENTION_MS = 24 * 60 * 60 * 1_000;

export const RATE_BUCKETS = ["address", "server"] as const;

export type RateBucket = (typeof RATE_BUCKETS)[number];

export function rateLimitFor(bucket: RateBucket): number {
    return bucket === "address" ? MOCK_RATE_LIMIT_PER_ADDRESS : MOCK_RATE_LIMIT_PER_SERVER;
}

/** One counter as it stands *after* this request was counted into it. */
export type RateSpend = {
    readonly bucket: RateBucket;
    readonly count: number;
    readonly windowStart: Date;
};

export type RateVerdict = {
    readonly allowed: boolean;
    /** Which counter refused, or the tightest one when the request was allowed. */
    readonly bucket: RateBucket;
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
 */
export function decideRateLimit(spends: readonly RateSpend[], now: Date): RateVerdict {
    let tightest: RateVerdict | null = null;

    for (const spend of spends) {
        const limit = rateLimitFor(spend.bucket);
        const endsAt = spend.windowStart.getTime() + MOCK_RATE_WINDOW_MS;
        // The count already includes this request, so landing exactly on the
        // limit is the last allowed one rather than the first refused one.
        const verdict: RateVerdict = {
            allowed: spend.count <= limit,
            bucket: spend.bucket,
            limit,
            remaining: Math.max(0, limit - spend.count),
            resetsAt: Math.ceil(endsAt / 1_000),
            retryAfterSeconds: retryAfter(endsAt, now),
        };

        if (tightest === null || isTighter(verdict, tightest)) {
            tightest = verdict;
        }
    }

    // No counters at all means nothing to refuse on. Reported against the
    // per-address limit because that is the one a caller is asking about.
    return (
        tightest ?? {
            allowed: true,
            bucket: "address",
            limit: MOCK_RATE_LIMIT_PER_ADDRESS,
            remaining: MOCK_RATE_LIMIT_PER_ADDRESS,
            resetsAt: Math.ceil((now.getTime() + MOCK_RATE_WINDOW_MS) / 1_000),
            retryAfterSeconds: Math.ceil(MOCK_RATE_WINDOW_MS / 1_000),
        }
    );
}

/** A refusal always outranks an allowance; between two of a kind, less headroom wins. */
function isTighter(candidate: RateVerdict, held: RateVerdict): boolean {
    if (candidate.allowed !== held.allowed) {
        return !candidate.allowed;
    }

    return candidate.remaining < held.remaining;
}

function retryAfter(endsAt: number, now: Date): number {
    const seconds = Math.ceil((endsAt - now.getTime()) / 1_000);

    // Clamped at both ends. Below 1 because a zero invites an immediate retry,
    // and above the window because a row written by a host whose clock ran fast
    // must not park a caller for longer than the window can possibly last.
    return Math.min(Math.max(1, seconds), Math.ceil(MOCK_RATE_WINDOW_MS / 1_000));
}
