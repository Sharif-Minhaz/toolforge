import { describe, expect, test } from "bun:test";

import {
    getTimeZoneCity,
    getTimeZoneRegion,
    getTimeZoneRegions,
    getTimeZonesInRegion,
    isKnownTimeZone,
    TIME_ZONES,
    UTC_REGION,
} from "@/modules/tools/domain/time-zones";
import { isFormattableTimeZone } from "@/modules/tools/domain/zone";

describe("the shipped snapshot", () => {
    test("covers the whole database and holds no duplicates", () => {
        expect(TIME_ZONES.length).toBeGreaterThan(400);
        expect(new Set(TIME_ZONES).size).toBe(TIME_ZONES.length);
    });

    test("includes UTC, which supportedValuesOf leaves out", () => {
        expect(TIME_ZONES[0]).toBe("UTC");
        expect(isKnownTimeZone("UTC")).toBe(true);
    });

    test("all but a handful of ids are formattable by the running engine", () => {
        // The snapshot is taken from Node, which carries newer tzdata than Bun:
        // `America/Coyhaique` arrived in 2025 and Bun 1.1 has not caught up.
        // That gap is exactly why the list is frozen rather than probed — the
        // picker offers the same options everywhere, and `convert` drops what
        // the local engine cannot render (see convert.test.ts).
        const unformattable = TIME_ZONES.filter((zone) => !isFormattableTimeZone(zone));

        expect(unformattable.length).toBeLessThan(5);
    });

    test("the zones the tool leans on are formattable everywhere", () => {
        for (const zone of [
            "UTC",
            "Asia/Dhaka",
            "Asia/Kolkata",
            "Europe/London",
            "America/New_York",
            "America/Los_Angeles",
            "Australia/Sydney",
        ]) {
            expect(isFormattableTimeZone(zone)).toBe(true);
        }
    });

    test("rejects an id that is not in the list", () => {
        expect(isKnownTimeZone("Middle/Earth")).toBe(false);
        expect(isKnownTimeZone("asia/dhaka")).toBe(false);
    });
});

describe("region and city labels", () => {
    test("splits an id at its first slash", () => {
        expect(getTimeZoneRegion("Asia/Dhaka")).toBe("Asia");
        expect(getTimeZoneCity("Asia/Dhaka")).toBe("Dhaka");
    });

    test("keeps a three-part id readable", () => {
        expect(getTimeZoneRegion("America/Argentina/Buenos_Aires")).toBe("America");
        expect(getTimeZoneCity("America/Argentina/Buenos_Aires")).toBe("Argentina / Buenos Aires");
    });

    test("turns the underscores IANA uses into spaces", () => {
        expect(getTimeZoneCity("America/New_York")).toBe("New York");
        expect(getTimeZoneCity("Pacific/Port_Moresby")).toBe("Port Moresby");
    });

    test("gives UTC a region of its own", () => {
        expect(getTimeZoneRegion("UTC")).toBe(UTC_REGION);
        expect(getTimeZoneCity("UTC")).toBe("UTC");
    });
});

describe("grouping", () => {
    test("lists UTC first and the rest alphabetically", () => {
        const regions = getTimeZoneRegions();

        expect(regions[0]).toBe(UTC_REGION);
        expect(regions.slice(1)).toEqual(regions.slice(1).toSorted((a, b) => a.localeCompare(b)));
        expect(regions).toContain("Asia");
        expect(regions).toContain("America");
    });

    test("every zone belongs to exactly one region bucket", () => {
        const grouped = getTimeZoneRegions().flatMap(getTimeZonesInRegion);

        expect(grouped.length).toBe(TIME_ZONES.length);
        expect(new Set(grouped).size).toBe(TIME_ZONES.length);
    });

    test("orders a region by the name a person reads, not by the raw id", () => {
        const asia = getTimeZonesInRegion("Asia");
        const cities = asia.map(getTimeZoneCity);

        expect(cities).toEqual(cities.toSorted((a, b) => a.localeCompare(b, "en")));
        expect(asia).toContain("Asia/Dhaka");
    });

    test("an unknown region has no zones rather than throwing", () => {
        expect(getTimeZonesInRegion("Mordor")).toEqual([]);
    });
});
