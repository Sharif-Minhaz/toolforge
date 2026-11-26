"use client";

import { useLocale } from "next-intl";

import { countryDescriber } from "@/modules/tools/domain/countries";

/**
 * `countryDescriber` for the active locale, from a client component.
 *
 * `Intl.DisplayNames` output can differ between ICU versions, so the usual rule
 * would be to keep it away from anything that renders on both sides of a
 * hydration boundary — see **Platform APIs That Read the Host**.
 *
 * It is safe **only** below a server-action boundary, and every caller so far is
 * there: the Domain Inspector's report view and the IP & Route Globe's hop
 * table are both mounted after their action returns, so nothing in either
 * subtree is ever server-rendered and there is no server render for a client
 * render to disagree with. Call this from anything that renders on the server
 * and the rule applies again — a server component calls `countryDescriber`
 * directly instead.
 */
export function useCountryName() {
    return countryDescriber(useLocale());
}
