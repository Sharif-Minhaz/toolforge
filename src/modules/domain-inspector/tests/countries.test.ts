import { describe, expect, test } from "bun:test";

import {
    countryFlagEmoji,
    countryLocation,
    knownCountryCodes,
} from "@/modules/domain-inspector/domain/countries";

describe("countryFlagEmoji", () => {
    const FLAGS: readonly (readonly [string, string])[] = [
        ["US", "🇺🇸"],
        ["BD", "🇧🇩"],
        ["DE", "🇩🇪"],
        ["TW", "🇹🇼"],
        ["EU", "🇪🇺"],
    ];

    for (const [code, flag] of FLAGS) {
        test(`renders ${code} as its regional-indicator pair`, () => {
            expect(countryFlagEmoji(code)).toBe(flag);
        });
    }

    test("accepts a lowercase code, because registries are inconsistent about case", () => {
        expect(countryFlagEmoji("us")).toBe(countryFlagEmoji("US"));
    });

    test("is two code points, not two characters", () => {
        // `.length` is 4 for a surrogate pair each. Spreading counts code points,
        // which is what proves this is one flag and not four glyphs.
        expect([...(countryFlagEmoji("JP") ?? "")]).toHaveLength(2);
    });

    const REFUSED = ["", "U", "USA", "1A", "--", "U S"];

    for (const input of REFUSED) {
        test(`refuses ${JSON.stringify(input)} rather than emitting replacement glyphs`, () => {
            expect(countryFlagEmoji(input)).toBeNull();
        });
    }
});

describe("countryLocation", () => {
    test("returns the centroid and the English name", () => {
        expect(countryLocation("BD")).toEqual({
            code: "BD",
            latitude: 23.684994,
            longitude: 90.356331,
            name: "Bangladesh",
        });
    });

    test("normalises case", () => {
        expect(countryLocation("de")).toEqual(countryLocation("DE"));
    });

    test("has an entry for every resolver country the propagation table names", () => {
        for (const code of ["US", "CY", "DE", "TW", "AU", "CN"]) {
            expect(countryLocation(code)).not.toBeNull();
        }
    });

    const ABSENT = [null, "", "ZZ", "XX", "AAA", "1"];

    for (const input of ABSENT) {
        test(`returns null for ${JSON.stringify(input)}`, () => {
            expect(countryLocation(input)).toBeNull();
        });
    }
});

describe("the coordinate table", () => {
    const codes = knownCountryCodes();

    test("covers the world without being a stub", () => {
        expect(codes.length).toBeGreaterThan(200);
    });

    test("holds only uppercase two-letter codes", () => {
        for (const code of codes) {
            expect(code).toMatch(/^[A-Z]{2}$/);
        }
    });

    test("has no duplicate keys", () => {
        expect(new Set(codes).size).toBe(codes.length);
    });

    test("places every country on the actual globe", () => {
        for (const code of codes) {
            const location = countryLocation(code);

            expect(location).not.toBeNull();
            expect(location!.latitude).toBeGreaterThanOrEqual(-90);
            expect(location!.latitude).toBeLessThanOrEqual(90);
            expect(location!.longitude).toBeGreaterThanOrEqual(-180);
            expect(location!.longitude).toBeLessThanOrEqual(180);
        }
    });

    test("gives every country a non-empty name", () => {
        for (const code of codes) {
            expect(countryLocation(code)!.name.length).toBeGreaterThan(0);
        }
    });

    test("puts a handful of well-known countries in the right hemisphere", () => {
        // A transposed latitude/longitude pair is the failure mode a range check
        // cannot see, so a few anchors are pinned by sign.
        expect(countryLocation("AU")!.latitude).toBeLessThan(0);
        expect(countryLocation("AU")!.longitude).toBeGreaterThan(0);
        expect(countryLocation("US")!.latitude).toBeGreaterThan(0);
        expect(countryLocation("US")!.longitude).toBeLessThan(0);
        expect(countryLocation("BR")!.latitude).toBeLessThan(0);
        expect(countryLocation("BR")!.longitude).toBeLessThan(0);
    });
});
