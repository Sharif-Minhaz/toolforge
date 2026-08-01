"use server";

import { verifyLinkPassword } from "../domain/password";
import { scheduleState } from "../domain/schedule";
import { parseTargetUrl } from "../domain/target";
import { isShortLinkStorageConfigured } from "../repository/config";
import { countVisit, findRedirectRecord } from "../repository/links";
import type { UnlockResult } from "../types";
import { unlockShortLinkSchema } from "../validation";

/**
 * Trades a correct password for the destination behind a gated link.
 *
 * The destination is never sent to the browser before this returns — the gate
 * page is rendered from the slug alone — so a locked link gives away nothing to
 * someone who does not have the password.
 *
 * The only thing slowing a guesser down is PBKDF2's own cost, which is
 * deliberate but modest. A link password is a curtain, not a lock, and the copy
 * on the tool says so.
 */
export async function unlockLink(input: { slug: string; password: string }): Promise<UnlockResult> {
    if (!isShortLinkStorageConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const parsed = unlockShortLinkSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "missing" };
    }

    const record = await findRedirectRecord(parsed.data.slug);

    if (record === null) {
        return { ok: false, reason: "missing" };
    }

    // Re-checked here and not only in the redirect: the window may have closed
    // between the gate rendering and the password being typed.
    const state = scheduleState(record.startsAt, record.expiresAt, Date.now());

    if (state !== "active") {
        return { ok: false, reason: state };
    }

    // A link whose password was removed while the gate was open still lets the
    // visitor through, rather than refusing a password that no longer exists.
    if (record.passwordHash !== null) {
        const correct = await verifyLinkPassword(parsed.data.password, record.passwordHash);

        if (!correct) {
            return { ok: false, reason: "wrong_password" };
        }
    }

    const target = parseTargetUrl(record.target);

    if (!target.ok) {
        return { ok: false, reason: "missing" };
    }

    // Counted here rather than when the gate was rendered, so a link only
    // scores a visit once somebody actually got through it.
    await countVisit(parsed.data.slug);

    return { ok: true, target: target.url };
}
