import { locatedHops } from "./hops";
import type { GlobeArc, GlobeMarker, Hop, RouteOptions } from "../types";

/**
 * Turning a route into the dots and curves COBE draws.
 *
 * Pure, which is the point: the globe is a canvas with a WebGL context in it and
 * nothing about it can be asserted in a unit test, so everything that decides
 * *what* it shows lives here instead and the island only hands the result over.
 *
 * The sizes are in COBE's units — a fraction of the globe's radius, useful
 * between about 0.01 and 0.1.
 */

const BASE_MARKER_SIZE = 0.035;

/** How much a marker grows per extra hop behind it, and how far that may go. */
const SIZE_PER_EXTRA_HOP = 0.006;
const MAX_MARKER_SIZE = 0.075;

/**
 * One dot per place, or one per hop.
 *
 * Grouping is the default and the honest one. Every coordinate here is a
 * country centroid, so ten hops crossing one country are ten hops at one point:
 * drawn ungrouped they stack into a single dot that merely looks bolder, which
 * reads as ten distinct places to anyone who does not already know how the data
 * was made. Grouped, one dot says "ten hops, one country", and the table beside
 * it still lists all ten.
 */
export function toGlobeMarkers(
    hops: readonly Hop[],
    options: Pick<RouteOptions, "groupByCountry">,
): readonly GlobeMarker[] {
    const located = locatedHops(hops);

    if (!options.groupByCountry) {
        return located.map((hop) => ({
            location: hop.coords as readonly [number, number],
            size: BASE_MARKER_SIZE,
            hops: [hop.index],
            country: hop.address?.country ?? "",
        }));
    }

    const byCountry = new Map<string, GlobeMarker>();

    for (const hop of located) {
        const country = hop.address?.country ?? "";
        const existing = byCountry.get(country);

        if (existing === undefined) {
            byCountry.set(country, {
                location: hop.coords as readonly [number, number],
                size: BASE_MARKER_SIZE,
                hops: [hop.index],
                country,
            });

            continue;
        }

        const hops = [...existing.hops, hop.index];

        byCountry.set(country, {
            ...existing,
            hops,
            size: Math.min(
                MAX_MARKER_SIZE,
                BASE_MARKER_SIZE + (hops.length - 1) * SIZE_PER_EXTRA_HOP,
            ),
        });
    }

    // Insertion order is route order, which is what makes the arcs below follow
    // the path rather than the alphabet.
    return [...byCountry.values()];
}

/**
 * The legs between consecutive places.
 *
 * A leg whose ends share a coordinate is dropped rather than drawn: two hops in
 * the same country are one point, and an arc from a point to itself renders as
 * a spike out of the globe that means nothing.
 */
export function toGlobeArcs(markers: readonly GlobeMarker[]): readonly GlobeArc[] {
    const arcs: GlobeArc[] = [];

    for (let index = 1; index < markers.length; index += 1) {
        const from = markers[index - 1].location;
        const to = markers[index].location;

        if (from[0] === to[0] && from[1] === to[1]) {
            continue;
        }

        arcs.push({ from, to });
    }

    return arcs;
}

/**
 * Whether the arc switch has anything to draw.
 *
 * The control is disabled rather than ignored when this is false — a switch
 * that is on and changes nothing is worse than one that explains why it cannot.
 */
export function canDrawArcs(markers: readonly GlobeMarker[]): boolean {
    return toGlobeArcs(markers).length > 0;
}

/**
 * Whether grouping would change anything. False when every located hop is
 * already in a country of its own, which is the other half of the same rule.
 */
export function canGroupByCountry(hops: readonly Hop[]): boolean {
    const located = locatedHops(hops);
    const countries = new Set(located.map((hop) => hop.address?.country ?? ""));

    return countries.size < located.length;
}
