"use server";

import { headers } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { runRoute } from "../repository/route";
import { routeRequestSchema } from "../validation/route-request";
import type { RouteResult } from "../types";

/**
 * One route from the page.
 *
 * Thin on purpose. Parsing, the counter and the lookups all live in
 * `repository/route.ts`, because the MCP adapter is a second entry point and
 * anything that happens only here would not happen for it. What is genuinely
 * this action's own is the payload check and the caller's address, neither of
 * which exists on the other path.
 */
export async function mapRoute(input: unknown): Promise<RouteResult> {
    const parsed = routeRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_hostname" };
    }

    const remoteIp = resolveRemoteIp(await headers());

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "ip_globe.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    return runRoute({ ...parsed.data, callerKey: remoteIp });
}
