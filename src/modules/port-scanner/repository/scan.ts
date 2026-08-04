import "server-only";

import { PORT_TIMEOUT_MS, SCAN_DEADLINE_MS } from "../domain/constants";
import { summarise } from "../domain/summary";
import { probePorts } from "./probe";
import { resolveScanTarget } from "./resolve";
import type { QuotaState, ScanResult } from "../types";

/**
 * Resolve, guard, scan — in that order, and the order is the security property.
 *
 * The address the guard approved is the address the sockets go to. Nothing
 * between here and `probePorts` sees the hostname again, so a record with a
 * one-second TTL cannot answer publicly for the check and privately for the
 * connection.
 */
export async function runScan(
    hostname: string,
    ports: readonly number[],
    quota: QuotaState,
): Promise<ScanResult> {
    const startedAt = new Date();
    const deadline = performance.now() + SCAN_DEADLINE_MS;

    const target = await resolveScanTarget(hostname, PORT_TIMEOUT_MS);

    if (!target.ok) {
        return { ok: false, reason: target.reason, quota };
    }

    const results = await probePorts(target.address, ports, target.version, deadline);

    // Nothing is logged on the way out, and that is the point rather than an
    // omission. A successful scan is not a warning or an error, which are the
    // only two levels this site emits, and the log line somebody would reach
    // for — which host, which ports — is precisely the record this tool
    // promises not to keep. Volume is already visible in the quota table.

    return {
        ok: true,
        hostname,
        address: target.address,
        version: target.version,
        results,
        summary: summarise(results),
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        quota,
    };
}
