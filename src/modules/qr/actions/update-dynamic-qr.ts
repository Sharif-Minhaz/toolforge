"use server";

import { SITE_URL } from "@/modules/seo/domain/site";
import { checkTarget, toLinkView } from "../domain/dynamic-view";
import { isDynamicQrConfigured } from "../repository/dynamic-config";
import { updateQrLinkTarget } from "../repository/qr-links";
import type { DynamicQrLinkView, DynamicQrResult } from "../types";
import { updateDynamicQrSchema } from "../validation/qr-options";

/**
 * Re-points an already-printed code.
 *
 * No Turnstile here, unlike creation. The edit token is 190 bits of randomness
 * and is itself the credential — a challenge would only add friction for the one
 * person who already holds it, and would do nothing an unguessable token does
 * not already do.
 */
export async function updateDynamicQr(input: {
    editToken: string;
    target: string;
}): Promise<DynamicQrResult<DynamicQrLinkView>> {
    if (!isDynamicQrConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const parsed = updateDynamicQrSchema.safeParse(input);

    if (!parsed.success) {
        // A malformed token cannot name a row, so it is reported as a missing
        // code rather than as a bad request — the reader has one link, and it
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

    const updated = await updateQrLinkTarget(parsed.data.editToken, target.value);

    return updated.ok ? { ok: true, value: toLinkView(updated.value, SITE_URL) } : updated;
}
