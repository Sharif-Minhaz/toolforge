"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { localeSchema } from "../validation/locale";

export type SetLocaleResult = { ok: true } | { ok: false; error: "invalid_locale" };

/** Persists the visitor's language choice. Never trusts the client payload. */
export async function setLocale(input: unknown): Promise<SetLocaleResult> {
    const parsed = localeSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, error: "invalid_locale" };
    }

    const store = await cookies();
    store.set(LOCALE_COOKIE, parsed.data, {
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
    });

    return { ok: true };
}
