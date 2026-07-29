import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { TURNSTILE_VERIFY_TIMEOUT_MS, TURNSTILE_VERIFY_URL } from "../domain/turnstile";
import { turnstileVerificationSchema } from "../validation/turnstile";

export type TurnstileVerification =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly reason: "not_configured" | "challenge_failed" | "upstream_unavailable";
      };

/**
 * Confirms a Turnstile token with Cloudflare. The only place `TURNSTILE_SECRET`
 * is read, and the gate that keeps a tool's daily model budget from being
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
        logEvent("error", "turnstile.not_configured");

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
            signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
        });

        if (!response.ok) {
            logEvent("error", "turnstile.unavailable", { status: response.status });

            return { ok: false, reason: "upstream_unavailable" };
        }

        const parsed = turnstileVerificationSchema.safeParse(await response.json());

        if (!parsed.success) {
            logEvent("error", "turnstile.unreadable");

            return { ok: false, reason: "upstream_unavailable" };
        }

        if (!parsed.data.success) {
            logEvent("warn", "turnstile.rejected", {
                codes: parsed.data["error-codes"]?.join(",") ?? "",
            });

            return { ok: false, reason: "challenge_failed" };
        }

        return { ok: true };
    } catch (caught) {
        logEvent("error", "turnstile.request_failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}

/**
 * Cloudflare sets `CF-Connecting-IP`; behind any other proxy the first hop in
 * `X-Forwarded-For` is the closest thing available. Passing it to siteverify is
 * optional, so an absent header simply means a slightly weaker check.
 */
export function resolveRemoteIp(inbound: Headers): string | undefined {
    const direct = inbound.get("cf-connecting-ip");

    if (direct) {
        return direct;
    }

    return inbound.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}
