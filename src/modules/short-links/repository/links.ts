import "server-only";

import { prisma } from "@/lib/prisma";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import { createEditToken, createSlug, hashEditToken } from "../domain/slug";
import { isShortLinkStorageConfigured } from "./config";
import type {
    NewShortLink,
    RedirectRecord,
    ShortLink,
    ShortLinkCreation,
    ShortLinkPatch,
    ShortLinkResult,
} from "../types";

/**
 * The only place the database is touched for short links.
 *
 * Every function answers with a typed result rather than throwing: a deployment
 * with no `DATABASE_URL` is a supported configuration — the QR tool still
 * generates static codes entirely in the browser — so "there is nowhere to
 * store this" has to be an answer the UI can render, not an exception.
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
    passwordHash: string | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    scans: number;
    createdAt: Date;
    lastScanAt: Date | null;
};

/** The digest never leaves this file; callers only ever learn that one exists. */
function toDomain(row: StoredLink): ShortLink {
    return {
        slug: row.slug,
        target: row.target,
        hasPassword: row.passwordHash !== null,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
        scans: row.scans,
        createdAt: row.createdAt,
        lastScanAt: row.lastScanAt,
    };
}

const LINK_FIELDS = {
    slug: true,
    target: true,
    passwordHash: true,
    startsAt: true,
    expiresAt: true,
    scans: true,
    createdAt: true,
    lastScanAt: true,
} as const;

/**
 * Stores a new link and returns its edit token exactly once.
 *
 * A drawn slug is retried on collision rather than being made longer: eight
 * characters is what somebody has to read off a poster, and at this scale a
 * collision is a rare retry rather than a design problem. A chosen alias gets
 * no retry at all — a second attempt would hand the reader a different link
 * from the one they asked for, so the collision is reported instead.
 */
export async function createShortLink(
    input: NewShortLink,
    randomBytes: RandomBytes = cryptoRandomBytes,
): Promise<ShortLinkResult<ShortLinkCreation>> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const editToken = createEditToken(randomBytes);
    const editTokenHash = await hashEditToken(editToken);

    const data = {
        target: input.target,
        passwordHash: input.passwordHash,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        editTokenHash,
    };

    const attempts = input.alias === null ? MAX_SLUG_ATTEMPTS : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const row = await prisma.shortLink.create({
                data: { ...data, slug: input.alias ?? createSlug(randomBytes) },
                select: LINK_FIELDS,
            });

            return { ok: true, value: { link: toDomain(row), editToken } };
        } catch (caught) {
            if (errorCode(caught) !== UNIQUE_VIOLATION) {
                logEvent("error", "shortLinks.create_failed", { error: describeError(caught) });

                return { ok: false, reason: "storage_unavailable" };
            }

            if (input.alias !== null) {
                return { ok: false, reason: "alias_taken" };
            }

            logEvent("warn", "shortLinks.slug_collision", { attempt: attempt + 1 });
        }
    }

    logEvent("error", "shortLinks.slug_exhausted", { attempts: MAX_SLUG_ATTEMPTS });

    return { ok: false, reason: "storage_unavailable" };
}

/**
 * The columns a redirect needs, without counting anything.
 *
 * Read and count are two statements rather than one `update` that returns the
 * row, because a password-gated link is read twice — once to discover it needs a
 * password, once after the visitor types it — and a single counting read would
 * score that as two visits. `countVisit` still does its increment in the
 * database, so concurrent visits cannot lose one.
 */
export async function findRedirectRecord(slug: string): Promise<RedirectRecord | null> {
    if (!isShortLinkStorageConfigured()) {
        return null;
    }

    try {
        return await prisma.shortLink.findUnique({
            where: { slug },
            select: { target: true, passwordHash: true, startsAt: true, expiresAt: true },
        });
    } catch (caught) {
        logEvent("error", "shortLinks.resolve_failed", { error: describeError(caught) });

        return null;
    }
}

/**
 * Counts one visit, at the moment the destination is actually handed over.
 *
 * `increment` pushes the arithmetic to the database: two visits at the same
 * moment would otherwise read the same count and store it twice, losing one.
 * A failure here is logged and swallowed — a visitor being sent where they
 * asked to go matters more than the tally.
 */
export async function countVisit(slug: string): Promise<void> {
    if (!isShortLinkStorageConfigured()) {
        return;
    }

    try {
        await prisma.shortLink.update({
            where: { slug },
            data: { scans: { increment: 1 }, lastScanAt: new Date() },
            select: { slug: true },
        });
    } catch (caught) {
        logEvent("warn", "shortLinks.count_failed", { error: describeError(caught) });
    }
}

/** Looks a link up by the token its owner holds, for the edit page. */
export async function findShortLinkByEditToken(
    editToken: string,
): Promise<ShortLinkResult<ShortLink>> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    try {
        const row = await prisma.shortLink.findUnique({
            where: { editTokenHash: await hashEditToken(editToken) },
            select: LINK_FIELDS,
        });

        return row === null
            ? { ok: false, reason: "not_found" }
            : { ok: true, value: toDomain(row) };
    } catch (caught) {
        logEvent("error", "shortLinks.lookup_failed", { error: describeError(caught) });

        return { ok: false, reason: "storage_unavailable" };
    }
}

/** Re-points a link. The slug — and therefore anything already printed — is untouched. */
export async function updateShortLink(
    editToken: string,
    patch: ShortLinkPatch,
): Promise<ShortLinkResult<ShortLink>> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    try {
        const row = await prisma.shortLink.update({
            where: { editTokenHash: await hashEditToken(editToken) },
            data: {
                target: patch.target,
                startsAt: patch.startsAt,
                expiresAt: patch.expiresAt,
                // Absent means "leave the password as it is"; spreading a
                // `passwordHash: undefined` key would say the same to Prisma,
                // but saying it explicitly is what stops a later edit here from
                // clearing every password by accident.
                ...(patch.passwordHash === undefined ? {} : { passwordHash: patch.passwordHash }),
            },
            select: LINK_FIELDS,
        });

        return { ok: true, value: toDomain(row) };
    } catch (caught) {
        if (errorCode(caught) === RECORD_NOT_FOUND) {
            return { ok: false, reason: "not_found" };
        }

        logEvent("error", "shortLinks.update_failed", { error: describeError(caught) });

        return { ok: false, reason: "storage_unavailable" };
    }
}

/** The stored digest for one slug, for the unlock page and nothing else. */
export async function findPasswordHash(slug: string): Promise<string | null> {
    if (!isShortLinkStorageConfigured()) {
        return null;
    }

    try {
        const row = await prisma.shortLink.findUnique({
            where: { slug },
            select: { passwordHash: true },
        });

        return row?.passwordHash ?? null;
    } catch (caught) {
        logEvent("error", "shortLinks.password_lookup_failed", { error: describeError(caught) });

        return null;
    }
}
