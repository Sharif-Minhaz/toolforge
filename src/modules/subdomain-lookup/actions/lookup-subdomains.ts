"use server";

import { headers } from "next/headers";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { readApexInput } from "../domain/apex";
import { runSubdomainLookup } from "../repository/lookup";
import { lookupRequestSchema } from "../validation/lookup-request";
import type { LookupResult } from "../types";

/**
 * One lookup from the page.
 *
 * **No Turnstile, unlike the Port Scanner and the Domain Inspector.** Those two
 * make this server touch a stranger's machine, and a human proof is what stands
 * between that and a free anonymous scanner. This one reads a public index that
 * anybody may read without a token, from a fixed address, and hands back names
 * the caller could have fetched themselves — putting a puzzle in front of it
 * would cost every reader something to save the one abuser a rate-limited hour.
 * What is actually at risk is throughput against a shared upstream allowance,
 * and a quota is the gate shaped like that. See `repository/quota.ts`.
 *
 * The apex is read here as well as in the island, because the island's copy is
 * a courtesy and this one is the decision.
 */
export async function lookupSubdomains(input: unknown): Promise<LookupResult> {
    const parsed = lookupRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_hostname" };
    }

    const read = readApexInput(parsed.data.apex);

    if (!read.ok) {
        return { ok: false, reason: read.reason };
    }

    const remoteIp = resolveRemoteIp(await headers());

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "subdomain_lookup.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    try {
        return await runSubdomainLookup({
            apex: read.apex,
            narrowedFrom: read.narrowedFrom,
            callerKey: remoteIp,
        });
    } catch (caught) {
        logEvent("error", "subdomain_lookup.failed", { error: describeError(caught) });

        return { ok: false, reason: "upstream_unavailable" };
    }
}
