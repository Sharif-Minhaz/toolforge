import { countryLocation } from "@/modules/tools/domain/countries";
import type { HostAddress } from "@/modules/tools/types/network";
import type { Hop, HopStatus, ParsedHop } from "../types";

/**
 * What a lookup came back with, in the only four shapes that matter to the hop
 * it describes.
 *
 * The refusals are named rather than collapsed into one because they are four
 * different things to tell a reader: a private address is their own network and
 * always will be, a timeout is the router declining to answer, an unresolvable
 * name may be a typo, and a blocked address is this server refusing to go
 * somewhere. Only one of those is worth trying again.
 */
export type HopLookup =
    | { readonly ok: true; readonly address: HostAddress }
    | {
          readonly ok: false;
          readonly reason: Extract<
              HopStatus,
              "private_range" | "timed_out" | "unresolvable" | "blocked_address"
          >;
      };

/**
 * A parsed hop plus what was found out about it.
 *
 * The one decision here is the difference between `located` and `no_country`: a
 * registry that answered but did not say which country a block was allocated to
 * leaves a hop that is real, named, and has nowhere to be drawn. That is a
 * finding, not a failure, and it keeps its own name so the table can say so
 * rather than showing a blank where a flag would be.
 */
export function toHop(parsed: ParsedHop, lookup: HopLookup): Hop {
    if (!lookup.ok) {
        return { ...parsed, status: lookup.reason, address: null, coords: null };
    }

    const location = countryLocation(lookup.address.country);

    if (location === null) {
        return { ...parsed, status: "no_country", address: lookup.address, coords: null };
    }

    return {
        ...parsed,
        // The address the lookup actually reached, which for a name is not
        // something the input carried and the reader has no other way to see.
        ip: lookup.address.ip,
        status: "located",
        address: lookup.address,
        coords: [location.latitude, location.longitude],
    };
}

/** Hops that have somewhere to be drawn, in route order. */
export function locatedHops(hops: readonly Hop[]): readonly Hop[] {
    return hops.filter((hop) => hop.coords !== null);
}
