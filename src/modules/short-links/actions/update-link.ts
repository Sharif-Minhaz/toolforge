"use server";

import { SITE_URL } from "@/modules/seo/domain/site";
import { TOOL_PREFIXES } from "../domain/constants";
import { hashLinkPassword } from "../domain/password";
import { checkSchedule } from "../domain/schedule";
import { checkTarget, toLinkView } from "../domain/view";
import { isShortLinkStorageConfigured } from "../repository/config";
import { updateShortLink } from "../repository/links";
import {
    SHORT_LINK_TOOLS,
    type ShortLinkResult,
    type ShortLinkView,
    type UpdateLinkInput,
} from "../types";
import { updateShortLinkSchema } from "../validation";

function toDate(value: string | null): Date | null {
    return value === null ? null : new Date(value);
}

/**
 * Re-points an existing link, and adjusts the window or password behind it.
 *
 * No Turnstile here, unlike creation. The edit token is 190 bits of randomness
 * and is itself the credential — a challenge would only add friction for the one
 * person who already holds it, and would do nothing an unguessable token does
 * not already do.
 */
export async function updateLink(input: UpdateLinkInput): Promise<ShortLinkResult<ShortLinkView>> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    if (!SHORT_LINK_TOOLS.includes(input.tool)) {
        return { ok: false, reason: "invalid_target" };
    }

    const parsed = updateShortLinkSchema.safeParse(input);

    if (!parsed.success) {
        // A malformed token cannot name a row, so it is reported as a missing
        // link rather than as a bad request — the reader has one link, and it
        // either works or it does not.
        return {
            ok: false,
            reason: input.target.trim().length === 0 ? "invalid_target" : "not_found",
        };
    }

    const target = checkTarget(parsed.data.target, SITE_URL);

    if (!target.ok) {
        return target;
    }

    const startsAt = toDate(parsed.data.startsAt);
    const expiresAt = toDate(parsed.data.expiresAt);
    const schedule = checkSchedule(startsAt, expiresAt, Date.now());

    if (!schedule.ok) {
        return { ok: false, reason: schedule.reason };
    }

    let passwordHash: string | null | undefined;

    if (parsed.data.password !== undefined) {
        if (parsed.data.password === null) {
            passwordHash = null;
        } else {
            const hashed = await hashLinkPassword(parsed.data.password);

            if (!hashed.ok) {
                return { ok: false, reason: hashed.reason };
            }

            passwordHash = hashed.hash;
        }
    }

    const updated = await updateShortLink(parsed.data.editToken, {
        target: target.value,
        startsAt,
        expiresAt,
        ...(passwordHash === undefined ? {} : { passwordHash }),
    });

    return updated.ok
        ? {
              ok: true,
              value: toLinkView(updated.value, SITE_URL, TOOL_PREFIXES[input.tool].redirect),
          }
        : updated;
}
