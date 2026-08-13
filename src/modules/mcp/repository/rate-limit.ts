import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    MCP_RATE_LIMIT_PER_ADDRESS,
    MCP_RATE_LIMIT_PER_TOOL,
    MCP_RATE_NAMESPACE,
    type McpRateBucket,
} from "../domain/rate-limit";

/**
 * This endpoint's binding of the shared counter in
 * `tools/repository/rate-counter.ts`.
 *
 * Two counters per call — the calling address and the tool name — under the
 * `mcp:call` namespace, so nothing here can land on a row either server studio
 * is using even though all three share `service_quota`.
 *
 * **Fails closed**, and this is the one place where that costs something worth
 * naming. Without a database or a salt the endpoint cannot meter, and an
 * unmetered public JSON-RPC endpoint that runs Argon2 and 4096-bit RSA
 * generation on demand is a scriptable way to spend a deployment's entire CPU
 * budget. The alternative — serving unmetered when the limiter is unavailable —
 * would make the limit decorative exactly when it matters. So a deployment
 * without `MCP_IP_SALT` and a database does not get a slower MCP endpoint; it
 * gets none, and `isMcpQuotaConfigured` is what the guide page reads to say so
 * out loud rather than leaving it to be discovered.
 */

export function isMcpStorageConfigured(): boolean {
    return (process.env.DATABASE_URL ?? "").trim().length > 0;
}

export function isMcpQuotaConfigured(): boolean {
    return isMcpStorageConfigured() && (process.env.MCP_IP_SALT ?? "").trim().length > 0;
}

export async function spendMcpQuota(
    address: string,
    toolName: string,
    now = new Date(),
): Promise<RateLimitOutcome<McpRateBucket> | null> {
    if (!isMcpQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<McpRateBucket>({
        salt: process.env.MCP_IP_SALT ?? "",
        namespace: MCP_RATE_NAMESPACE,
        counters: [
            { bucket: "address", value: address, limit: MCP_RATE_LIMIT_PER_ADDRESS },
            { bucket: "tool", value: toolName, limit: MCP_RATE_LIMIT_PER_TOOL },
        ],
        fallback: { bucket: "address", limit: MCP_RATE_LIMIT_PER_ADDRESS },
        now,
    });
}

export { sweepRateCounterRows as sweepMcpQuotaRows };
