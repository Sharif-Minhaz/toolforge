/**
 * What the studio's public execution path counts, and how far.
 *
 * The arithmetic and the reasoning behind a one-minute fixed window live in
 * `tools/domain/rate-window.ts`, shared with the JSON Server Studio. What is
 * specific to this module is the two ceilings below — named here so a limit is
 * still written down in exactly one place.
 */

export const RATE_BUCKETS = ["address", "server"] as const;

export type RateBucket = (typeof RATE_BUCKETS)[number];

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

export function rateLimitFor(bucket: RateBucket): number {
    return bucket === "address" ? MOCK_RATE_LIMIT_PER_ADDRESS : MOCK_RATE_LIMIT_PER_SERVER;
}
