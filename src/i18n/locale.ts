import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Reads the persisted locale, falling back to the default when unset or invalid. */
export async function getUserLocale(): Promise<Locale> {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;

    return isLocale(value) ? value : DEFAULT_LOCALE;
}
