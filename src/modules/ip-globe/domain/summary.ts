import { locatedHops } from "./hops";
import type { Hop, RouteSummary } from "../types";

/**
 * What the route adds up to.
 *
 * Countries and networks are counted *distinct and in the order first reached*,
 * because that is the sentence a reader wants — "four countries, three networks"
 * — and a route that re-enters a country it already crossed has not entered a
 * fifth.
 */
export function summarizeRoute(hops: readonly Hop[]): RouteSummary {
    const countries: string[] = [];
    const asns: number[] = [];
    let totalRttMs: number | null = null;

    for (const hop of hops) {
        const country = hop.address?.country ?? null;

        if (country !== null && !countries.includes(country)) {
            countries.push(country);
        }

        const asn = hop.address?.asn ?? null;

        if (asn !== null && !asns.includes(asn)) {
            asns.push(asn);
        }

        if (hop.rttMs !== null) {
            totalRttMs = (totalRttMs ?? 0) + hop.rttMs;
        }
    }

    return {
        total: hops.length,
        located: locatedHops(hops).length,
        countries,
        asns,
        // Rounded because the inputs are one decimal place at best and summing
        // them in binary floating point produces digits none of them claimed.
        totalRttMs: totalRttMs === null ? null : Math.round(totalRttMs * 100) / 100,
    };
}
