import { describe, expect, test } from "bun:test";

import { hexToRgbTriplet, lighten } from "@/modules/ip-globe/domain/palette";

describe("hexToRgbTriplet", () => {
    test("converts a six-digit hex into floats between 0 and 1", () => {
        expect(hexToRgbTriplet("#ffffff")).toEqual([1, 1, 1]);
        expect(hexToRgbTriplet("#000000")).toEqual([0, 0, 0]);
    });

    test("expands a three-digit hex the way CSS does", () => {
        expect(hexToRgbTriplet("#f00")).toEqual(hexToRgbTriplet("#ff0000") as never);
    });

    test("accepts the case and whitespace a computed style may carry", () => {
        expect(hexToRgbTriplet("  #AABBCC  ")).toEqual(hexToRgbTriplet("#aabbcc") as never);
    });

    test("refuses anything that is not a hex colour rather than returning NaN", () => {
        // WebGL renders a NaN uniform as black without complaining, so a wrong
        // answer here would be a globe that is simply dark for no stated reason.
        for (const value of ["", "oklch(0.57 0.225 277)", "#12345", "rgb(1,2,3)", "#gggggg"]) {
            expect(hexToRgbTriplet(value)).toBeNull();
        }
    });
});

describe("lighten", () => {
    test("moves a colour toward white by the given fraction", () => {
        expect(lighten([0, 0, 0], 0.5)).toEqual([0.5, 0.5, 0.5]);
        expect(lighten([0.2, 0.4, 0.6], 0)).toEqual([0.2, 0.4, 0.6]);
        expect(lighten([0.2, 0.4, 0.6], 1)).toEqual([1, 1, 1]);
    });

    test("clamps a fraction outside 0–1 rather than overshooting", () => {
        expect(lighten([0.5, 0.5, 0.5], 2)).toEqual([1, 1, 1]);
        expect(lighten([0.5, 0.5, 0.5], -1)).toEqual([0.5, 0.5, 0.5]);
    });
});
