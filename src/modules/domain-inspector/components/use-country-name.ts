"use client";

import { useLocale } from "next-intl";

import { countryFlagEmoji, countryLocation } from "../domain/countries";

/**
 * A country code turned into a flag and a localised name.
 *
 * `Intl.DisplayNames` carries CLDR's country names in every locale this site
 * speaks, which is the only reason ~250 translated names are not sitting in
 * both message catalogues. Its output can differ between ICU versions, so the
 * usual rule would be to keep it away from anything that renders on both sides
 * of a hydration boundary — see **Platform APIs That Read the Host**.
 *
 * It is safe here for one specific reason: every caller lives under the report
 * view, which is mounted only after the server action returns. Nothing in this
 * subtree is ever server-rendered, so there is no server render for a client
 * render to disagree with. Move one of these callers above that boundary and
 * the rule applies again.
 *
 * The English name from the coordinate table is the fallback, so a locale whose
 * ICU build lacks a region name still gets words rather than a bare code.
 */
export function useCountryName() {
    const locale = useLocale();

    let display: Intl.DisplayNames | null = null;

    try {
        display = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
        display = null;
    }

    return function describeCountry(code: string | null): {
        readonly flag: string | null;
        readonly name: string | null;
    } {
        if (code === null || code.length === 0) {
            return { flag: null, name: null };
        }

        const normalized = code.toUpperCase();
        const fallback = countryLocation(normalized)?.name ?? null;

        // `of` returns the input unchanged for a code it does not know, which
        // would show "ZZ" twice — as the chip and as its own explanation.
        const localized = display?.of(normalized) ?? null;
        const name = localized !== null && localized !== normalized ? localized : fallback;

        return { flag: countryFlagEmoji(normalized), name };
    };
}
