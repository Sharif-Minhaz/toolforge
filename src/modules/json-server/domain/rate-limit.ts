/**
 * What the JSON Server Studio's public execution path counts, and how far.
 *
 * The arithmetic and the reasoning behind a one-minute fixed window live in
 * `tools/domain/rate-window.ts`, shared with the Mock Server Studio. What is
 * specific to this module is the two ceilings below.
 *
 * They are the same numbers the mock studio uses, and that is a decision rather
 * than a copy: the thing being defended against is identical — a front end with
 * a runaway `useEffect` calling its own API in a loop — and a developer who has
 * used one studio should not discover the other has a different budget. Should
 * one ever need to move, it moves here alone.
 */

export const RATE_BUCKETS = ["address", "server"] as const;

export type RateBucket = (typeof RATE_BUCKETS)[number];

/** Per calling address, per minute. Two a second sustained. */
export const JSON_RATE_LIMIT_PER_ADDRESS = 120;

/**
 * Per server key, per minute.
 *
 * Ten times the per-address limit, so a fixture genuinely shared by a team or a
 * CI fleet is never refused by this bound before the per-address one bites — and
 * a flood spread across many addresses still meets a ceiling, which is the only
 * thing the per-address limit cannot do.
 */
export const JSON_RATE_LIMIT_PER_SERVER = 1_200;

export function rateLimitFor(bucket: RateBucket): number {
    return bucket === "address" ? JSON_RATE_LIMIT_PER_ADDRESS : JSON_RATE_LIMIT_PER_SERVER;
}
