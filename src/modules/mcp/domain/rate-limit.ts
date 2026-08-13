/**
 * What the MCP endpoint counts, and how far.
 *
 * The arithmetic and the reasoning behind a one-minute fixed window live in
 * `tools/domain/rate-window.ts`, shared with both server studios. What is
 * specific here is the pair of ceilings and the choice of what the second one
 * is keyed on.
 *
 * The caller is a model in a loop, which is a different animal from the runaway
 * `useEffect` the studios defend against. It is slower — a model cannot call
 * faster than it can generate — but it retries thoughtfully, rewording rather
 * than repeating, so a refusal does not stop it the way a `429` stops a fetch
 * loop. Hence a ceiling well above what a conversation produces and well below
 * what a script could spend.
 *
 * Keyed on the caller and on the *tool*, mirroring the studios' caller-and-
 * target pairing. A per-tool ceiling is what bounds a flood spread across many
 * addresses, and keying it on the tool rather than on the endpoint means an
 * assault on one tool cannot take the other thirty down with it.
 */

export const MCP_RATE_BUCKETS = ["address", "tool"] as const;

export type McpRateBucket = (typeof MCP_RATE_BUCKETS)[number];

/**
 * Per calling address, per minute.
 *
 * A person working through an assistant produces a handful of tool calls a
 * minute; an agent fanning out over a list of a hundred URLs produces a burst.
 * Sixty covers both and still refuses a script.
 */
export const MCP_RATE_LIMIT_PER_ADDRESS = 60;

/**
 * Per tool name, per minute, across every caller.
 *
 * Ten times the per-address ceiling, so a genuinely popular tool is never
 * refused by this bound before the per-address one bites, while a distributed
 * flood still meets a ceiling — the one thing a per-address limit cannot do.
 */
export const MCP_RATE_LIMIT_PER_TOOL = 600;

/** Distinguishes these counters from every other limit sharing `service_quota`. */
export const MCP_RATE_NAMESPACE = "mcp:call";

export function mcpRateLimitFor(bucket: McpRateBucket): number {
    return bucket === "address" ? MCP_RATE_LIMIT_PER_ADDRESS : MCP_RATE_LIMIT_PER_TOOL;
}
