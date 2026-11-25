import type { WatermarkFailureReason } from "../types";

/**
 * Workers AI's two codes for an account that has spent its day's neurons, as the
 * worker prints them (`AiError: 4006: …`), and the sentence both come with.
 *
 * The body is read because the status cannot say it: the worker answers every
 * exception with `500`, which is also what an outage looks like.
 */
const QUOTA_EXHAUSTED = /\bAiError:\s*(?:4006|3036)\b|daily free allocation/i;

/** The worker's status and its own words → the reason the reader is shown. */
export function classifyUpstreamFailure(status: number, detail: string): WatermarkFailureReason {
    if (status === 401 || status === 403) {
        return "unauthorized";
    }

    // Before 429: waiting a minute answers the worker's own limiter and does
    // nothing at all for a spent day.
    if (QUOTA_EXHAUSTED.test(detail)) {
        return "quota_exhausted";
    }

    if (status === 429) {
        return "rate_limited";
    }

    if (status === 413) {
        return "too_large";
    }

    if (status === 415) {
        return "unsupported_type";
    }

    return status >= 400 && status < 500 ? "invalid_request" : "upstream_unavailable";
}
