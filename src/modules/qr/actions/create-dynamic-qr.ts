"use server";

import { headers } from "next/headers";

import { SITE_URL } from "@/modules/seo/domain/site";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { checkTarget, toCreatedView } from "../domain/dynamic-view";
import { isDynamicQrConfigured } from "../repository/dynamic-config";
import { createQrLink } from "../repository/qr-links";
import type { DynamicQrCreatedView, DynamicQrResult } from "../types";
import { createDynamicQrSchema } from "../validation/qr-options";

/**
 * Mints a dynamic code: a short link that can be re-pointed after the code has
 * been printed.
 *
 * Order matters. The destination is checked before the challenge, and the
 * challenge before anything is written — a target this service would refuse must
 * not cost a Turnstile verification, and nothing reaches the database without a
 * solved challenge behind it, because an open redirect that anyone can create
 * by script is a phishing tool rather than a convenience.
 */
export async function createDynamicQr(input: {
    target: string;
    token: string;
}): Promise<DynamicQrResult<DynamicQrCreatedView>> {
    if (!isDynamicQrConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const parsed = createDynamicQrSchema.safeParse(input);

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

    const created = await createQrLink(target.value);

    if (!created.ok) {
        return created;
    }

    return {
        ok: true,
        value: toCreatedView(created.value.link, created.value.editToken, SITE_URL),
    };
}
