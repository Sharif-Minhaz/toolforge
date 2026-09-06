import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import type { DnsResolver } from "@/modules/tools/types/network";

import { parseRouteInput } from "../domain/parse";
import { spendRouteQuota } from "./quota";
import { locateRoute } from "./trace";
import type { RouteMode, RouteResult } from "../types";

/**
 * One route, from text to located hops, with the counter spent on the way.
 *
 * This orchestration is in `repository/` rather than in the Server Action for
 * one reason: the MCP adapter is a second entry point, and a second entry point
 * that skipped the counter would spend this deployment's share of three free
 * registries without counting it. Everything that must happen for *every* route,
 * however it was asked for, happens here.
 *
 * The order is the argument:
 *
 * 1. **Parse** — free and local. A typo must not cost a database write or a
 *    single query to somebody else's registry.
 * 2. **Quota** — the only gate that limits *volume*. Everything above it refuses
 *    one bad request; this is what refuses the sixteenth good one. It is spent
 *    whether or not the route locates anything, because a refused route that
 *    costs nothing is a free retry loop.
 * 3. **Lookups**, with the address guard applied to what DNS returned rather
 *    than to what was typed.
 */
export type RouteRequest = {
    readonly input: string;
    readonly mode: RouteMode;
    readonly resolver: DnsResolver;
    /**
     * What the quota counts. The caller's address from the page; a literal from
     * MCP, which has no address here — giving every MCP caller one shared
     * allowance, the conservative reading against somebody else's free tier.
     */
    readonly callerKey: string;
};

export async function runRoute(request: RouteRequest): Promise<RouteResult> {
    const read = parseRouteInput(request.input, request.mode);

    if (!read.ok) {
        return { ok: false, reason: read.reason };
    }

    // `null` is a limiter that could not run — no database, no salt, a thrown
    // transaction. It refuses, rather than falling open onto three registries
    // that are not ours to spend.
    const spent = await spendRouteQuota(request.callerKey);

    if (spent === null || !spent.verdict.allowed) {
        return { ok: false, reason: "rate_limited" };
    }

    try {
        return {
            ok: true,
            report: await locateRoute(read.hops, request.mode, request.resolver),
        };
    } catch (caught) {
        logEvent("error", "ip_globe.lookup_failed", { error: describeError(caught) });

        return { ok: false, reason: "lookup_failed" };
    }
}
