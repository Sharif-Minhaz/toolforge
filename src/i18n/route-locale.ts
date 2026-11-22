import "server-only";

import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { isLocale, LOCALES, type Locale } from "./config";

/** The `params` every route under `app/[locale]` receives. */
export type LocaleParams = Promise<{ locale: string }>;

/** Each page prerenders once per language; `proxy.ts` picks which one a request gets. */
export function generateLocaleParams(): { locale: Locale }[] {
    return LOCALES.map((locale) => ({ locale }));
}

/**
 * Pins next-intl to the route's locale. Call it first in every layout, page and
 * `generateMetadata` under `app/[locale]` — they render independently, and one
 * that skips it falls back to reading the request, which turns a prerendered
 * page back into a per-request one (and fails the build under Cache Components).
 */
export async function enterLocale(params: LocaleParams): Promise<Locale> {
    const { locale } = await params;

    if (!isLocale(locale)) {
        notFound();
    }

    setRequestLocale(locale);

    return locale;
}
