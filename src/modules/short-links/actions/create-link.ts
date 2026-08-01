"use server";

import { headers } from "next/headers";

import { SITE_URL } from "@/modules/seo/domain/site";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { TOOL_PREFIXES } from "../domain/constants";
import { hashLinkPassword } from "../domain/password";
import { checkSchedule } from "../domain/schedule";
import { checkAlias, checkTarget, toCreatedView } from "../domain/view";
import { isShortLinkStorageConfigured } from "../repository/config";
import { createShortLink } from "../repository/links";
import {
    SHORT_LINK_TOOLS,
    type CreateLinkInput,
    type ShortLinkCreatedView,
    type ShortLinkResult,
} from "../types";
import { createShortLinkSchema } from "../validation";

function toDate(value: string | null): Date | null {
    return value === null ? null : new Date(value);
}

/**
 * Mints a short link: an address that can be re-pointed after it has been
 * printed, pasted, or scanned.
 *
 * Order matters, and it is the same order for both tools. Everything free is
 * checked first, then the challenge, then the write — a request this service
 * would refuse must not cost a Turnstile verification, and nothing reaches the
 * database without a solved challenge behind it, because an open redirect
 * anyone can create by script is a phishing service rather than a convenience.
 */
export async function createLink(
    input: CreateLinkInput,
): Promise<ShortLinkResult<ShortLinkCreatedView>> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    if (!SHORT_LINK_TOOLS.includes(input.tool)) {
        return { ok: false, reason: "invalid_target" };
    }

    const parsed = createShortLinkSchema.safeParse(input);

    if (!parsed.success) {
        // Told apart rather than collapsed: "type a destination" and "solve the
        // challenge" are different things to go and do.
        return {
            ok: false,
            reason: (input.token ?? "").length === 0 ? "challenge_required" : "invalid_target",
        };
    }

    const target = checkTarget(parsed.data.target, SITE_URL);

    if (!target.ok) {
        return target;
    }

    const alias = checkAlias(parsed.data.alias);

    if (!alias.ok) {
        return alias;
    }

    const startsAt = toDate(parsed.data.startsAt);
    const expiresAt = toDate(parsed.data.expiresAt);
    const schedule = checkSchedule(startsAt, expiresAt, Date.now());

    if (!schedule.ok) {
        return { ok: false, reason: schedule.reason };
    }

    let passwordHash: string | null = null;

    if (parsed.data.password !== null) {
        const hashed = await hashLinkPassword(parsed.data.password);

        if (!hashed.ok) {
            return { ok: false, reason: hashed.reason };
        }

        passwordHash = hashed.hash;
    }

    const challenge = await verifyTurnstileToken(
        parsed.data.token,
        resolveRemoteIp(await headers()),
    );

    if (!challenge.ok) {
        return {
            ok: false,
            reason: challenge.reason === "not_configured" ? "not_configured" : "challenge_failed",
        };
    }

    const created = await createShortLink({
        target: target.value,
        alias: alias.value,
        passwordHash,
        startsAt,
        expiresAt,
    });

    if (!created.ok) {
        return created;
    }

    return {
        ok: true,
        value: toCreatedView(
            created.value.link,
            created.value.editToken,
            SITE_URL,
            TOOL_PREFIXES[input.tool],
        ),
    };
}
