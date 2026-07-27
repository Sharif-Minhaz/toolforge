"use server";

import { cookies } from "next/headers";

import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE } from "../domain/consent";
import { consentSchema } from "../validation/consent";

export type SetAnalyticsConsentResult = { ok: true } | { ok: false; error: "invalid_consent" };

/** Persists the visitor's analytics answer. Never trusts the client payload. */
export async function setAnalyticsConsent(input: unknown): Promise<SetAnalyticsConsentResult> {
    const parsed = consentSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, error: "invalid_consent" };
    }

    const store = await cookies();
    store.set(CONSENT_COOKIE, parsed.data, {
        maxAge: CONSENT_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
    });

    return { ok: true };
}
