import { timingSafeEqual } from "@/modules/tools/domain/timing-safe";

import type { McpAccessDecision, McpToolKind } from "../types";

/**
 * Who may call what, decided before any handler runs.
 *
 * The endpoint serves two populations at once and they need opposite defaults.
 *
 * **Offline tools are open.** Encoding base64 spends this deployment's CPU for
 * a few milliseconds and nothing else. Putting a token in front of that would
 * buy no safety and would cost the thing the endpoint is for — somebody asking
 * their assistant to decode a token without first provisioning a secret. The
 * rate limiter, not a password, is what bounds them.
 *
 * **Network tools are gated, and refused when ungated.** A tool that resolves a
 * hostname and connects to it is an outbound request this deployment makes on
 * behalf of whoever asked. Left open on a public URL, that is an open relay
 * with our name on the packets, driven by any model that has been told our
 * address. So the gate fails closed in both directions: no token presented is a
 * refusal, and *no token configured* is also a refusal, rather than a service
 * that quietly waves everyone through because an environment variable is blank.
 *
 * The comparison is timing-safe. The window is small — a token is compared once
 * per request against an attacker who controls the guess — but the fix is one
 * import.
 */
export function decideMcpAccess(
    kind: McpToolKind,
    presented: string | null,
    configured: string,
): McpAccessDecision {
    if (kind === "offline") {
        return { allowed: true };
    }

    const expected = configured.trim();

    if (expected.length === 0) {
        return { allowed: false, reason: "token_missing" };
    }

    if (presented === null || presented.length === 0) {
        return { allowed: false, reason: "token_required" };
    }

    return timingSafeEqual(presented, expected)
        ? { allowed: true }
        : { allowed: false, reason: "token_invalid" };
}

/**
 * The token out of an `Authorization` header, or `null`.
 *
 * `Bearer` only, and case-insensitively, which is what RFC 6750 says and what
 * every MCP client sends. Anything else — `Basic`, a bare token with no scheme
 * — is treated as absent rather than guessed at, so a misconfigured client gets
 * `token_required` and a hint, not a silent 401 it cannot explain.
 */
export function readBearerToken(header: string | null): string | null {
    if (header === null) {
        return null;
    }

    const match = /^bearer\s+(\S+)$/i.exec(header.trim());

    return match?.[1] ?? null;
}
