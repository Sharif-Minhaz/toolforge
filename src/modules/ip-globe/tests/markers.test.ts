import { describe, expect, test } from "bun:test";

import { toHop, locatedHops, type HopLookup } from "@/modules/ip-globe/domain/hops";
import {
    canDrawArcs,
    canGroupByCountry,
    toGlobeArcs,
    toGlobeMarkers,
} from "@/modules/ip-globe/domain/markers";
import { summarizeRoute } from "@/modules/ip-globe/domain/summary";
import type { HostAddress } from "@/modules/tools/types/network";
import type { ParsedHop } from "@/modules/ip-globe/types";

function parsed(index: number, overrides: Partial<ParsedHop> = {}): ParsedHop {
    return {
        index,
        label: `hop-${index}`,
        ip: `203.0.113.${index}`,
        hostname: null,
        rttMs: null,
        timedOut: false,
        ...overrides,
    };
}

function address(country: string | null, overrides: Partial<HostAddress> = {}): HostAddress {
    return {
        ip: "203.0.113.1",
        version: 4,
        reverse: null,
        asn: 64_500,
        asName: "EXAMPLE-AS",
        prefix: "203.0.113.0/24",
        country,
        registry: "arin",
        network: "EXAMPLE-NET",
        org: "Example, Inc.",
        ...overrides,
    };
}

function located(index: number, country: string, overrides: Partial<HostAddress> = {}) {
    return toHop(parsed(index), {
        ok: true,
        address: address(country, { ip: `203.0.113.${index}`, ...overrides }),
    });
}

describe("toHop", () => {
    test("places a hop at its allocation country's centroid", () => {
        const hop = located(1, "US");

        expect(hop.status).toBe("located");
        expect(hop.coords).not.toBeNull();
    });

    test("a registry that answered without a country is `no_country`, not a failure", () => {
        const hop = toHop(parsed(1), { ok: true, address: address(null) });

        // The hop is real and named — there is simply nowhere to draw it. That
        // is a finding the table states, not a lookup that went wrong.
        expect(hop.status).toBe("no_country");
        expect(hop.coords).toBeNull();
        expect(hop.address?.asName).toBe("EXAMPLE-AS");
    });

    test("a country code no centroid exists for leaves the hop off the globe", () => {
        const hop = toHop(parsed(1), { ok: true, address: address("ZZ") });

        expect(hop.status).toBe("no_country");
        expect(hop.coords).toBeNull();
    });

    test("every refusal keeps its own name", () => {
        const reasons: HopLookup[] = [
            { ok: false, reason: "private_range" },
            { ok: false, reason: "timed_out" },
            { ok: false, reason: "unresolvable" },
            { ok: false, reason: "blocked_address" },
        ];

        for (const lookup of reasons) {
            const hop = toHop(parsed(1), lookup);

            expect(hop.status).toBe(lookup.ok ? "located" : lookup.reason);
            expect(hop.coords).toBeNull();
            expect(hop.address).toBeNull();
        }
    });

    test("a resolved name reports the address that was actually reached", () => {
        const hop = toHop(parsed(1, { ip: null, hostname: "example.com" }), {
            ok: true,
            address: address("US", { ip: "198.51.100.7" }),
        });

        // The input carried a name, so the address is something the reader has
        // no other way to see.
        expect(hop.ip).toBe("198.51.100.7");
    });
});

describe("toGlobeMarkers", () => {
    test("grouped, hops sharing a country become one dot that names them all", () => {
        const hops = [located(1, "US"), located(2, "US"), located(3, "DE")];
        const markers = toGlobeMarkers(hops, { groupByCountry: true });

        expect(markers).toHaveLength(2);
        expect(markers[0].hops).toEqual([1, 2]);
        expect(markers[1].hops).toEqual([3]);
    });

    test("grouped, a dot carrying more hops is drawn larger", () => {
        const one = toGlobeMarkers([located(1, "US")], { groupByCountry: true });
        const three = toGlobeMarkers([located(1, "US"), located(2, "US"), located(3, "US")], {
            groupByCountry: true,
        });

        expect(three[0].size).toBeGreaterThan(one[0].size);
        expect(three[0].size).toBeLessThanOrEqual(0.075);
    });

    test("ungrouped, every located hop keeps its own dot", () => {
        const hops = [located(1, "US"), located(2, "US"), located(3, "DE")];

        expect(toGlobeMarkers(hops, { groupByCountry: false })).toHaveLength(3);
    });

    test("markers come back in route order, not alphabetically", () => {
        const hops = [located(1, "US"), located(2, "DE"), located(3, "AU")];
        const markers = toGlobeMarkers(hops, { groupByCountry: true });

        expect(markers.map((marker) => marker.country)).toEqual(["US", "DE", "AU"]);
    });

    test("hops with nowhere to be drawn are absent from the globe, not at [0, 0]", () => {
        const hops = [
            located(1, "US"),
            toHop(parsed(2), { ok: false, reason: "timed_out" }),
            located(3, "DE"),
        ];

        expect(toGlobeMarkers(hops, { groupByCountry: true })).toHaveLength(2);
        expect(locatedHops(hops)).toHaveLength(2);
    });
});

describe("toGlobeArcs", () => {
    test("joins consecutive places in route order", () => {
        const markers = toGlobeMarkers([located(1, "US"), located(2, "DE"), located(3, "AU")], {
            groupByCountry: true,
        });
        const arcs = toGlobeArcs(markers);

        expect(arcs).toHaveLength(2);
        expect(arcs[0].from).toEqual(markers[0].location);
        expect(arcs[0].to).toEqual(markers[1].location);
    });

    test("drops a leg whose ends are the same point", () => {
        // Ungrouped hops inside one country share a centroid, and an arc from a
        // point to itself renders as a spike that means nothing.
        const markers = toGlobeMarkers([located(1, "US"), located(2, "US")], {
            groupByCountry: false,
        });

        expect(toGlobeArcs(markers)).toHaveLength(0);
        expect(canDrawArcs(markers)).toBe(false);
    });

    test("one place alone has nothing to join", () => {
        const markers = toGlobeMarkers([located(1, "US")], { groupByCountry: true });

        expect(canDrawArcs(markers)).toBe(false);
    });
});

describe("canGroupByCountry", () => {
    test("is false when every located hop is already in a country of its own", () => {
        expect(canGroupByCountry([located(1, "US"), located(2, "DE")])).toBe(false);
    });

    test("is true as soon as two hops share one", () => {
        expect(canGroupByCountry([located(1, "US"), located(2, "US")])).toBe(true);
    });

    test("ignores hops that were never located", () => {
        const hops = [located(1, "US"), toHop(parsed(2), { ok: false, reason: "timed_out" })];

        expect(canGroupByCountry(hops)).toBe(false);
    });
});

describe("summarizeRoute", () => {
    test("counts countries and networks distinct, in the order first reached", () => {
        const hops = [
            located(1, "US"),
            located(2, "US", { asn: 64_501 }),
            located(3, "DE", { asn: 64_500 }),
        ];
        const summary = summarizeRoute(hops);

        expect(summary.countries).toEqual(["US", "DE"]);
        expect(summary.asns).toEqual([64_500, 64_501]);
        expect(summary.total).toBe(3);
        expect(summary.located).toBe(3);
    });

    test("sums reported round-trip times and rounds off the binary noise", () => {
        const hops = [
            toHop(parsed(1, { rttMs: 0.1 }), { ok: true, address: address("US") }),
            toHop(parsed(2, { rttMs: 0.2 }), { ok: true, address: address("US") }),
        ];

        // 0.1 + 0.2 is 0.30000000000000004, which is a precision neither input
        // claimed.
        expect(summarizeRoute(hops).totalRttMs).toBe(0.3);
    });

    test("a route where nothing reported a timing has no total, rather than zero", () => {
        expect(summarizeRoute([located(1, "US")]).totalRttMs).toBeNull();
    });

    test("counts every hop as a hop, located or not", () => {
        const hops = [located(1, "US"), toHop(parsed(2), { ok: false, reason: "timed_out" })];
        const summary = summarizeRoute(hops);

        expect(summary.total).toBe(2);
        expect(summary.located).toBe(1);
    });
});
