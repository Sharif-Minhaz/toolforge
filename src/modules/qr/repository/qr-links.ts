import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import { createEditToken, createSlug, hashEditToken } from "../domain/short-code";
import { isDynamicQrConfigured } from "./dynamic-config";
import type { DynamicQrCreation, DynamicQrLink, DynamicQrResult } from "../types";

/**
 * The only place the database is touched for dynamic codes.
 *
 * Every function answers with a typed result rather than throwing: a deployment
 * with no `DATABASE_URL` is a supported configuration — the rest of the tool
 * runs entirely in the browser — so "there is nowhere to store this" has to be
 * an answer the UI can render, not an exception.
 */

/** How many slug collisions to ride out before giving up. */
const MAX_SLUG_ATTEMPTS = 5;

/** Prisma's code for "the row this update named does not exist". */
const RECORD_NOT_FOUND = "P2025";

/** Prisma's code for a unique-constraint collision. */
const UNIQUE_VIOLATION = "P2002";

function errorCode(caught: unknown): string | null {
    return typeof caught === "object" && caught !== null && "code" in caught
        ? String((caught as { code: unknown }).code)
        : null;
}

type StoredLink = {
    slug: string;
    target: string;
    scans: number;
    createdAt: Date;
    lastScanAt: Date | null;
};

function toDomain(row: StoredLink): DynamicQrLink {
    return {
        slug: row.slug,
        target: row.target,
        scans: row.scans,
        createdAt: row.createdAt,
        lastScanAt: row.lastScanAt,
    };
}

const LINK_FIELDS = {
    slug: true,
    target: true,
    scans: true,
    createdAt: true,
    lastScanAt: true,
} as const;

/**
 * Stores a new dynamic code and returns its edit token exactly once.
 *
 * The slug is retried on collision rather than being made longer: eight
 * characters is what somebody has to read off a poster, and at this scale a
 * collision is a rare retry rather than a design problem.
 */
export async function createQrLink(
    target: string,
    randomBytes: RandomBytes = cryptoRandomBytes,
): Promise<DynamicQrResult<DynamicQrCreation>> {
    if (!isDynamicQrConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const editToken = createEditToken(randomBytes);
    const editTokenHash = await hashEditToken(editToken);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        try {
            const row = await prisma.qrLink.create({
                data: { slug: createSlug(randomBytes), target, editTokenHash },
                select: LINK_FIELDS,
            });

            return { ok: true, value: { link: toDomain(row), editToken } };
        } catch (caught) {
            if (errorCode(caught) === UNIQUE_VIOLATION) {
                logEvent("warn", "qr.slug_collision", { attempt: attempt + 1 });
                continue;
            }

            logEvent("error", "qr.create_failed", { error: describeError(caught) });

            return { ok: false, reason: "storage_unavailable" };
        }
    }

    logEvent("error", "qr.slug_exhausted", { attempts: MAX_SLUG_ATTEMPTS });

    return { ok: false, reason: "storage_unavailable" };
}

/**
 * Resolves a scanned slug and counts the scan in the same statement.
 *
 * One `update` rather than a read followed by a write: two scans of the same
 * poster at the same moment would otherwise read the same count and store it
 * twice, losing one. `increment` pushes that to the database, where it belongs.
 */
export async function resolveScan(slug: string): Promise<string | null> {
    if (!isDynamicQrConfigured()) {
        return null;
    }

    try {
        const row = await prisma.qrLink.update({
            where: { slug },
            data: { scans: { increment: 1 }, lastScanAt: new Date() },
            select: { target: true },
        });

        return row.target;
    } catch (caught) {
        if (errorCode(caught) === RECORD_NOT_FOUND) {
            return null;
        }

        logEvent("error", "qr.resolve_failed", { error: describeError(caught) });

        return null;
    }
}

/** Looks a code up by the token its owner holds, for the edit page. */
export async function findQrLinkByEditToken(
    editToken: string,
): Promise<DynamicQrResult<DynamicQrLink>> {
    if (!isDynamicQrConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    try {
        const row = await prisma.qrLink.findUnique({
            where: { editTokenHash: await hashEditToken(editToken) },
            select: LINK_FIELDS,
        });

        return row === null
            ? { ok: false, reason: "not_found" }
            : { ok: true, value: toDomain(row) };
    } catch (caught) {
        logEvent("error", "qr.lookup_failed", { error: describeError(caught) });

        return { ok: false, reason: "storage_unavailable" };
    }
}

/** Re-points a printed code. The slug, and therefore the printed code, is untouched. */
export async function updateQrLinkTarget(
    editToken: string,
    target: string,
): Promise<DynamicQrResult<DynamicQrLink>> {
    if (!isDynamicQrConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    try {
        const row = await prisma.qrLink.update({
            where: { editTokenHash: await hashEditToken(editToken) },
            data: { target },
            select: LINK_FIELDS,
        });

        return { ok: true, value: toDomain(row) };
    } catch (caught) {
        if (errorCode(caught) === RECORD_NOT_FOUND) {
            return { ok: false, reason: "not_found" };
        }

        logEvent("error", "qr.update_failed", { error: describeError(caught) });

        return { ok: false, reason: "storage_unavailable" };
    }
}
