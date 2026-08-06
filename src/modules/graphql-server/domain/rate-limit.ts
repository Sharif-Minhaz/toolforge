/**
 * What the GraphQL Server Studio's public execution path counts, and how far.
 *
 * The arithmetic and the reasoning behind a one-minute fixed window live in
 * `tools/domain/rate-window.ts`, shared with both other server studios. What is
 * specific here is the two ceilings, and the fact that they are **lower than the
 * REST studio's on purpose**.
 *
 * A rate limit counts requests, and a GraphQL request is not the same size as a
 * REST one. `GET /posts` returns one collection; one GraphQL document can ask
 * for every collection, joined, paged and aliased, and the node budget in
 * `guard.ts` deliberately lets a substantial query through — that is what makes
 * the tool worth using. Counting those at the same rate as a REST read would
 * meter a request that can be two orders of magnitude more work as though it
 * were the same thing. Half is not a precise number; it is the acknowledgement
 * that the two are not comparable and that the cheaper one should not set the
 * budget for the more expensive.
 */

export const RATE_BUCKETS = ["address", "server"] as const;

export type RateBucket = (typeof RATE_BUCKETS)[number];

/** Per calling address, per minute. One a second sustained. */
export const GRAPHQL_RATE_LIMIT_PER_ADDRESS = 60;

/**
 * Per server key, per minute.
 *
 * Ten times the per-address limit, so a fixture genuinely shared by a team or a
 * CI fleet is never refused by this bound before the per-address one bites — and
 * a flood spread across many addresses still meets a ceiling, which is the only
 * thing the per-address limit cannot do.
 */
export const GRAPHQL_RATE_LIMIT_PER_SERVER = 600;

export function rateLimitFor(bucket: RateBucket): number {
    return bucket === "address" ? GRAPHQL_RATE_LIMIT_PER_ADDRESS : GRAPHQL_RATE_LIMIT_PER_SERVER;
}
