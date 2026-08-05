import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import type { QuotaRow, QuotaState } from "@/modules/tools/types";

import { CREATE_QUOTA_LIMIT } from "../domain/constants";
import {
    describeCreateQuota,
    hasCreateWindowExpired,
    isCreateQuotaExhausted,
} from "../domain/quota";
import { isMockQuotaConfigured } from "./config";

/**
 * The counter that keeps workspace creation from being a free, scriptable
 * source of publicly callable addresses.
 *
 * In Postgres rather than in memory, because on serverless a per-process
 * counter resets on every cold start and each instance counts separately. The
 * three-workspace cap in the cookie does not help here at all: the cookie
 * belongs to the caller, and a script does not send one.
 */

/**
 * The caller's address is never stored. What is stored is a salted digest of
 * it, which answers "is this the same caller as a minute ago" and nothing else.
 *
 * The salt is a secret for that reason: without one, a table of SHA-256 digests
 * of IPv4 addresses is reversible by brute force in seconds, there being only
 * four billion of them. Rotating it resets every open window, which is the
 * correct failure and not a bug.
 */
function visitorHash(address: string): string {
    const salt = process.env.MOCK_IP_SALT ?? "";

    return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

export type CreateQuotaCheck = {
    readonly ok: boolean;
    readonly quota: QuotaState;
};

async function readRow(hash: string): Promise<QuotaRow | null> {
    return prisma.mockQuota.findUnique({
        where: { visitorHash: hash },
        select: { count: true, windowStart: true },
    });
}

/** Reads the allowance without spending any of it, for the first paint. */
export async function peekCreateQuota(address: string, now = new Date()): Promise<QuotaState> {
    if (!isMockQuotaConfigured()) {
        return describeCreateQuota(null, now);
    }

    try {
        return describeCreateQuota(await readRow(visitorHash(address)), now);
    } catch (caught) {
        logEvent("error", "mock_server.quota_read_failed", { error: describeError(caught) });

        return describeCreateQuota(null, now);
    }
}

/**
 * Spends one creation, or refuses.
 *
 * Read and write are one transaction because two visitors behind one address
 * arrive together, and a read-then-write would let both see seven and both
 * write eight. The `upsert` inside it also removes the "row appeared between
 * the read and the insert" race a find-then-create has.
 *
 * **A database that cannot be reached refuses.** Every other degradation on
 * this site falls toward doing the work — no Turnstile key and a tool renders
 * disabled, no database and the shortener says it has nowhere to store a link.
 * This one falls the other way, because the failure mode of an open limiter is
 * an unmetered service minting public endpoints under this site's name. A
 * missing `MOCK_IP_SALT` is refused for the same reason.
 *
 * The allowance is spent even when the work that follows fails, because a
 * refused attempt that costs nothing is a free retry loop, and retrying is what
 * an abuser does.
 */
export async function spendCreateQuota(
    address: string,
    now = new Date(),
): Promise<CreateQuotaCheck> {
    if (!isMockQuotaConfigured()) {
        logEvent("error", "mock_server.quota_not_configured");

        return { ok: false, quota: describeCreateQuota(null, now) };
    }

    const hash = visitorHash(address);

    try {
        return await prisma.$transaction(async (tx) => {
            const row = await tx.mockQuota.findUnique({
                where: { visitorHash: hash },
                select: { count: true, windowStart: true },
            });

            if (isCreateQuotaExhausted(row, now, CREATE_QUOTA_LIMIT)) {
                return { ok: false, quota: describeCreateQuota(row, now) };
            }

            // An expired window is reopened at this request rather than swept on
            // a schedule, so nothing has to run in the background for the limit
            // to be correct.
            const reset = row === null || hasCreateWindowExpired(row, now);
            const next = reset
                ? { count: 1, windowStart: now }
                : { count: row.count + 1, windowStart: row.windowStart };

            await tx.mockQuota.upsert({
                where: { visitorHash: hash },
                create: { visitorHash: hash, ...next },
                update: next,
            });

            return { ok: true, quota: describeCreateQuota(next, now) };
        });
    } catch (caught) {
        logEvent("error", "mock_server.quota_write_failed", { error: describeError(caught) });

        return { ok: false, quota: describeCreateQuota(null, now) };
    }
}
