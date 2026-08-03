"use server";

import { headers } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { readHostInput } from "../domain/hostname";
import { classifyAddress } from "../domain/ip";
import { runInspection } from "../repository/inspect";
import type { InspectionResult } from "../types";
import { inspectionRequestSchema } from "../validation/inspection";

/**
 * Runs one hostname through every lookup the tool offers.
 *
 * The order is the security argument. The input is decomposed before the
 * challenge is spent, because a hostname that could never be looked up must not
 * cost a Turnstile verification. The challenge is verified before anything
 * reaches the network, because without it this endpoint is a free scanner that
 * runs from this server's address and this site's reputation — a stranger's
 * traffic, arriving at a stranger's host, with our name on it.
 *
 * Address filtering happens deeper still, in `address-guard.ts`, and applies to
 * every hop rather than only the first: it is what stops a name that resolves
 * to `169.254.169.254` turning this into a reader for whatever the cloud
 * metadata service will say.
 */
export async function inspectDomain(input: unknown): Promise<InspectionResult> {
    const parsed = inspectionRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_hostname" };
    }

    const { token, host, resolver, probeSite } = parsed.data;
    const read = readHostInput(host);

    if (!read.ok) {
        return { ok: false, reason: read.reason };
    }

    // A literal address is checked here rather than in the guard, so the reader
    // is told their own input was refused instead of watching every panel fail.
    if (read.breakdown.isIp && classifyAddress(read.breakdown.hostname) !== "public") {
        return { ok: false, reason: "private_address" };
    }

    const challenge = await verifyTurnstileToken(token, resolveRemoteIp(await headers()));

    if (!challenge.ok) {
        return { ok: false, reason: challenge.reason };
    }

    try {
        const report = await runInspection({
            breakdown: read.breakdown,
            options: { resolver, probeSite },
            now: new Date(),
        });

        return { ok: true, report };
    } catch (caught) {
        // Every panel already degrades on its own, so reaching here means
        // something outside them broke — worth a log, not a stack on screen.
        logEvent("error", "domain_inspector.inspection_threw", {
            hostname: read.breakdown.hostname,
            error: caught instanceof Error ? caught.message : "unknown",
        });

        return { ok: false, reason: "lookup_failed" };
    }
}
