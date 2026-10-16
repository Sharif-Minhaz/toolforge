import "server-only";

import {
    spendRateCounters,
    sweepRateCounterRows,
    type RateLimitOutcome,
} from "@/modules/tools/repository/rate-counter";

import {
    SPEECH_LIMIT_PER_ADDRESS,
    SPEECH_LIMIT_PER_DEPLOYMENT,
    SPEECH_WINDOW_MS,
} from "../domain/constants";

export type SpeechQuotaBucket = "address" | "deployment";

/**
 * The counter in front of the speech service.
 *
 * **Fails closed.** Without a database or a salt this cannot meter, and it
 * returns `null`, which the route treats as a refusal. Left open, the route is
 * a free, scriptable text-to-speech API running from this server's address —
 * and since the service sees every reader of this site as that one address,
 * whoever abused it would be spending everybody's welcome, not just their own.
 *
 * Two counters, as the shared engine requires, and here both earn their place:
 * one per caller, so nobody takes the hour's allowance for themselves, and one
 * for the whole deployment, which is the number the service actually sees.
 */

export function isSpeechConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.TEXT_TO_SPEECH_IP_SALT ?? "").trim().length > 0
    );
}

export async function spendSpeechQuota(
    address: string,
    now = new Date(),
): Promise<RateLimitOutcome<SpeechQuotaBucket> | null> {
    if (!isSpeechConfigured()) {
        return null;
    }

    return spendRateCounters<SpeechQuotaBucket>({
        salt: process.env.TEXT_TO_SPEECH_IP_SALT ?? "",
        // Its own namespace, so no row here can land on one another tool is
        // using in the shared `service_quota` table.
        namespace: "speech:generate",
        counters: [
            { bucket: "address", value: address, limit: SPEECH_LIMIT_PER_ADDRESS },
            // One fixed value, so every caller lands on the same row.
            { bucket: "deployment", value: "all", limit: SPEECH_LIMIT_PER_DEPLOYMENT },
        ],
        fallback: { bucket: "address", limit: SPEECH_LIMIT_PER_ADDRESS },
        windowMs: SPEECH_WINDOW_MS,
        now,
    });
}

export { sweepRateCounterRows as sweepSpeechQuotaRows };
