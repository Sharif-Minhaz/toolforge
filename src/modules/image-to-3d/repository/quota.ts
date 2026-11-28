import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    GENERATION_LIMIT_PER_ADDRESS,
    GENERATION_LIMIT_PER_DEPLOYMENT,
    GENERATION_WINDOW_MS,
} from "../domain/constants";

export type GenerationQuotaBucket = "address" | "deployment";

/**
 * The counter that keeps "describe this picture" from being a free, scriptable
 * vision model on this deployment's Workers AI allowance.
 *
 * **Fails closed.** Without a database or a salt this cannot meter and returns
 * `null`, which the action treats as a refusal. The allowance is 10,000 neurons
 * a day per Cloudflare account, shared with every other worker on it; an open
 * path here spends the Watermark Remover's day as well as this tool's.
 *
 * Two counters, both needed. The address counter stops one visitor spending
 * the day; the deployment counter stops every visitor together spending it,
 * because the worker sees this server's address for all of them.
 */
export function isGenerationQuotaConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.IMAGE_TO_3D_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendGenerationQuota(
    address: string,
    now = new Date(),
): Promise<RateLimitOutcome<GenerationQuotaBucket> | null> {
    if (!isGenerationQuotaConfigured()) {
        return null;
    }

    return spendRateCounters<GenerationQuotaBucket>({
        salt: process.env.IMAGE_TO_3D_IP_SALT ?? "",
        // Its own namespace, so no row here can land on one another tool is
        // using in the shared `service_quota` table.
        namespace: "image-to-3d:generate",
        counters: [
            { bucket: "address", value: address, limit: GENERATION_LIMIT_PER_ADDRESS },
            // One fixed value, so every caller lands on the same row.
            { bucket: "deployment", value: "all", limit: GENERATION_LIMIT_PER_DEPLOYMENT },
        ],
        fallback: { bucket: "address", limit: GENERATION_LIMIT_PER_ADDRESS },
        windowMs: GENERATION_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepGenerationQuotaRows };
