import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import type { QuotaRow, QuotaState } from "@/modules/tools/types";
import { QUOTA_LIMIT } from "../domain/constants";
import { describeQuota, hasWindowExpired, isQuotaExhausted } from "../domain/quota";

/**
 * The counter that keeps this tool from being a free anonymous scanning
 * service.
 *
 * In Postgres rather than in memory, because on serverless a per-process
 * counter resets on every cold start and each instance counts separately — a
 * limit that a determined caller clears by waiting a minute is not a limit, and
 * shipping one under that name is worse than shipping none, because it stops
 * anyone looking again.
 */

/**
 * The visitor's address is never stored. What is stored is a salted digest of
 * it, which answers "is this the same caller as a minute ago" and nothing else
 * — a dump of this table says how often somebody scanned and not who.
 *
 * The salt is a secret for that reason: without one, a table of SHA-256 digests
 * of IPv4 addresses is reversible by brute force in seconds, there being only
 * four billion of them. Rotating it resets every window, which is the correct
 * failure and not a bug.
 */
function visitorHash(address: string): string {
    const salt = process.env.PORT_SCAN_IP_SALT ?? "";

    return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

export function isQuotaConfigured(): boolean {
    return (
        (process.env.DATABASE_URL ?? "").trim().length > 0 &&
        (process.env.PORT_SCAN_IP_SALT ?? "").trim().length > 0
    );
}

export type QuotaCheck =
    | { readonly ok: true; readonly quota: QuotaState }
    | { readonly ok: false; readonly quota: QuotaState };

async function readRow(hash: string): Promise<QuotaRow | null> {
    const row = await prisma.portScanQuota.findUnique({
        where: { visitorHash: hash },
        select: { count: true, windowStart: true },
    });

    return row;
}

/** Reads the allowance without spending any of it, for the first paint. */
export async function peekQuota(address: string, now = new Date()): Promise<QuotaState> {
    if (!isQuotaConfigured()) {
        return describeQuota(null, now);
    }

    try {
        return describeQuota(await readRow(visitorHash(address)), now);
    } catch (caught) {
        logEvent("error", "port_scanner.quota_read_failed", { error: describeError(caught) });

        return describeQuota(null, now);
    }
}

/**
 * Spends one scan, or refuses.
 *
 * The read and the write are one transaction because two visitors behind one
 * address arrive concurrently, and a read-then-write would let both see nine
 * and both write ten. `upsert` inside it also removes the "row appeared between
 * the read and the insert" race that a find-then-create has.
 *
 * A database that is unreachable **refuses**, rather than falling open. Every
 * other failure on this site degrades toward doing the work; this one degrades
 * toward not doing it, because the failure mode of an open limiter here is an
 * unmetered scanning service.
 */
export async function spendQuota(address: string, now = new Date()): Promise<QuotaCheck> {
    if (!isQuotaConfigured()) {
        logEvent("error", "port_scanner.quota_not_configured");

        return { ok: false, quota: describeQuota(null, now) };
    }

    const hash = visitorHash(address);

    try {
        return await prisma.$transaction(async (tx) => {
            const row = await tx.portScanQuota.findUnique({
                where: { visitorHash: hash },
                select: { count: true, windowStart: true },
            });

            if (isQuotaExhausted(row, now, QUOTA_LIMIT)) {
                return { ok: false as const, quota: describeQuota(row, now) };
            }

            // An expired window is reopened at this request rather than swept
            // on a schedule, so nothing has to run in the background for the
            // limit to be correct.
            const reset = row === null || hasWindowExpired(row, now);
            const next = reset
                ? { count: 1, windowStart: now }
                : { count: row.count + 1, windowStart: row.windowStart };

            await tx.portScanQuota.upsert({
                where: { visitorHash: hash },
                create: { visitorHash: hash, ...next },
                update: next,
            });

            return { ok: true as const, quota: describeQuota(next, now) };
        });
    } catch (caught) {
        logEvent("error", "port_scanner.quota_write_failed", { error: describeError(caught) });

        return { ok: false, quota: describeQuota(null, now) };
    }
}
