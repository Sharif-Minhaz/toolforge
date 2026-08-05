"use server";

import { headers } from "next/headers";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { checkHostSyntax, extractHostname } from "@/modules/tools/domain/host-syntax";
import { classifyAddress, isIpAddress } from "@/modules/tools/domain/ip";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { MAX_INPUT_LENGTH } from "../domain/constants";
import { resolveRequestedPorts } from "../domain/port-spec";
import { peekQuota, spendQuota } from "../repository/quota";
import { runScan } from "../repository/scan";
import { scanRequestSchema } from "../validation/scan-request";
import type { QuotaState } from "@/modules/tools/types";
import type { ScanResult } from "../types";

/**
 * One scan, and every gate it has to pass first.
 *
 * The order is the security argument, and each step is placed where it is for a
 * reason that is not obvious from the outside:
 *
 * 1. **Shape, then syntax, then ports** — all free, all local. A typo must not
 *    cost a Turnstile verification, a database write, or a packet.
 * 2. **Turnstile before the quota**, so a script cannot burn a stranger's
 *    allowance by replaying their address without solving anything.
 * 3. **Quota before the network**, because it is the only gate that limits
 *    *volume*. Everything above it refuses one bad request; this is what
 *    refuses the thousandth good one.
 * 4. **Address guard inside the scan**, on what DNS returned rather than on
 *    what was typed.
 *
 * The quota is spent whether or not the scan finds anything. A refused scan
 * that costs nothing is a free retry loop, and retrying is exactly what an
 * abuser does.
 */
export async function scanPorts(input: unknown): Promise<ScanResult> {
    const parsed = scanRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_hostname" };
    }

    const { host, preset, ports: spec, turnstileToken } = parsed.data;

    const syntax = checkHostSyntax(host, MAX_INPUT_LENGTH);

    if (syntax !== null) {
        return { ok: false, reason: syntax };
    }

    const hostname = extractHostname(host);

    if (hostname === null) {
        return { ok: false, reason: "invalid_hostname" };
    }

    // A literal address is judged here rather than in the guard, so somebody
    // who typed `127.0.0.1` is told their own input was refused instead of
    // watching a scan run and report nothing.
    if (isIpAddress(hostname) && classifyAddress(hostname) !== "public") {
        return { ok: false, reason: "blocked_address" };
    }

    const requested = resolveRequestedPorts(preset, spec);

    if (!requested.ok) {
        return {
            ok: false,
            reason: requested.reason,
            token: requested.token,
            count: requested.count,
        };
    }

    const remoteIp = resolveRemoteIp(await headers());
    const challenge = await verifyTurnstileToken(turnstileToken, remoteIp);

    if (!challenge.ok) {
        return { ok: false, reason: "turnstile_failed" };
    }

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "port_scanner.no_remote_ip");

        return { ok: false, reason: "quota_exceeded" };
    }

    const spent = await spendQuota(remoteIp);

    if (!spent.ok) {
        return { ok: false, reason: "quota_exceeded", quota: spent.quota };
    }

    try {
        return await runScan(hostname, requested.ports, spent.quota);
    } catch (caught) {
        logEvent("error", "port_scanner.scan_failed", { error: describeError(caught) });

        return { ok: false, reason: "scan_failed", quota: spent.quota };
    }
}

/**
 * The allowance, without spending any of it.
 *
 * Read on the server for the first paint so the count is correct before the
 * reader presses anything — a "10 remaining" that turns out to be 0 on the
 * first press is worse than no counter.
 */
export async function readScanQuota(): Promise<QuotaState | null> {
    const remoteIp = resolveRemoteIp(await headers());

    return remoteIp === undefined ? null : peekQuota(remoteIp);
}
