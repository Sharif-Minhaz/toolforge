import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { DETECTION_REQUEST_TIMEOUT_MS, TURNSTILE_VERIFY_URL } from "../domain/constants";
import { turnstileVerificationSchema } from "../validation/detection";

export type TurnstileVerification =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly reason: "not_configured" | "challenge_failed" | "upstream_unavailable";
      };

/**
 * Confirms a Turnstile token with Cloudflare. The only place `TURNSTILE_SECRET`
 * is read, and the gate that keeps the detector's daily model budget from being
 * drained by a script.
 *
 * A token is single-use: the caller must reset the widget after every attempt,
 * successful or not.
 */
export async function verifyTurnstileToken(
    token: string,
    remoteIp?: string,
): Promise<TurnstileVerification> {
    const secret = process.env.TURNSTILE_SECRET;

    if (!secret) {
        logEvent("error", "ai_text_detector.turnstile_not_configured");

        return { ok: false, reason: "not_configured" };
    }

    const body = new URLSearchParams({ secret, response: token });

    if (remoteIp) {
        body.set("remoteip", remoteIp);
    }

    try {
        const response = await fetch(TURNSTILE_VERIFY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(DETECTION_REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            logEvent("error", "ai_text_detector.turnstile_unavailable", {
                status: response.status,
            });

            return { ok: false, reason: "upstream_unavailable" };
        }

        const parsed = turnstileVerificationSchema.safeParse(await response.json());

        if (!parsed.success) {
            logEvent("error", "ai_text_detector.turnstile_unreadable");

            return { ok: false, reason: "upstream_unavailable" };
        }

        if (!parsed.data.success) {
            logEvent("warn", "ai_text_detector.turnstile_rejected", {
                codes: parsed.data["error-codes"]?.join(",") ?? "",
            });

            return { ok: false, reason: "challenge_failed" };
        }

        return { ok: true };
    } catch (caught) {
        logEvent("error", "ai_text_detector.turnstile_request_failed", {
            error: describeError(caught),
        });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
