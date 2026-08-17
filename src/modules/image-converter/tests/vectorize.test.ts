import { describe, expect, test } from "bun:test";

import type { SourcePixels } from "@/modules/image-converter/domain/icon-layout";
import {
    buildPalette,
    despeckle,
    labelComponents,
    mapToPalette,
    minRegionArea,
    polygonArea,
    simplifyPolygon,
    toHexColor,
    toPathData,
    traceComponent,
    tracePixelsToSvg,
    traceTolerance,
    type TracePoint,
} from "@/modules/image-converter/domain/vectorize";

const SWATCHES: Record<string, readonly [number, number, number, number]> = {
    ".": [0, 0, 0, 0],
    "#": [220, 20, 20, 255],
    o: [20, 20, 220, 255],
    w: [255, 255, 255, 255],
    k: [0, 0, 0, 255],
};

/** A picture drawn as text, so every case below says what it is looking at. */
function image(rows: readonly string[]): SourcePixels {
    const width = rows[0].length;
    const height = rows.length;
    const data = new Uint8ClampedArray(width * height * 4);

    for (const [y, row] of rows.entries()) {
        for (let x = 0; x < width; x += 1) {
            const swatch = SWATCHES[row[x]];

            if (swatch === undefined) {
                throw new Error(`unknown swatch ${row[x]}`);
            }

            data.set(swatch, (y * width + x) * 4);
        }
    }

    return { data, width, height };
}

function size(pixels: SourcePixels) {
    return { width: pixels.width, height: pixels.height };
}

function loopsOf(pixels: SourcePixels, colors = 4): TracePoint[][] {
    const palette = buildPalette(pixels, colors);
    const components = labelComponents(mapToPalette(pixels, palette), size(pixels));

    return Array.from({ length: components.count }, (_, label) =>
        traceComponent(components, label, size(pixels)),
    ).flat();
}

describe("traceTolerance", () => {
    test("the top of the range moves no point at all", () => {
        expect(traceTolerance(100)).toBe(0);
    });

    test("the bottom flattens a staircase two and a half pixels deep", () => {
        expect(traceTolerance(10)).toBeCloseTo(2.5, 6);
    });

    test("falls off evenly in between, and never turns back", () => {
        for (let quality = 11; quality <= 100; quality += 1) {
            expect(traceTolerance(quality)).toBeLessThanOrEqual(traceTolerance(quality - 1));
        }
    });

    test("a value outside the range is clamped rather than trusted", () => {
        expect(traceTolerance(400)).toBe(0);
        expect(traceTolerance(-50)).toBeCloseTo(2.5, 6);
        expect(traceTolerance(Number.NaN)).toBe(0);
    });

    test("bends a small grid by the same fraction, not the same pixels", () => {
        // A 2.5-pixel tolerance on a 16×16 icon would demolish it.
        expect(traceTolerance(10, 256)).toBeLessThan(0.1);
        expect(traceTolerance(10, 250_000)).toBeCloseTo(1.25, 6);
        expect(traceTolerance(10, 9_000_000)).toBeCloseTo(2.5, 6);
    });
});

describe("minRegionArea", () => {
    test("the top of the range still refuses grain smaller than a 2×2 block", () => {
        // Not one pixel: with no floor at all a grainy megapixel traces into
        // 794 000 regions and 25 MB of paths.
        expect(minRegionArea(100)).toBe(4);
    });

    test("the bottom treats anything under an 8×8 patch as noise", () => {
        expect(minRegionArea(10)).toBe(64);
    });

    test("grows with the square of the distance, the way speck counts do", () => {
        expect(minRegionArea(55)).toBeLessThan(minRegionArea(10) / 2);
    });

    test("scales with the grid, because a 2×2 block is a feature on a favicon", () => {
        expect(minRegionArea(100, 256)).toBe(1);
        expect(minRegionArea(10, 256)).toBe(1);
        expect(minRegionArea(10, 250_000)).toBe(16);
    });

    test("never asks for less than a single pixel", () => {
        expect(minRegionArea(Number.NaN, 0)).toBe(1);
        expect(minRegionArea(1_000, 1)).toBe(1);
    });
});

describe("buildPalette", () => {
    test("one colour needs one entry", () => {
        expect(buildPalette(image(["##", "##"]), 8)).toEqual([{ r: 220, g: 20, b: 20 }]);
    });

    test("finds every colour that is there, and no more", () => {
        const palette = buildPalette(image(["#o", "#o"]), 8);

        expect(palette).toHaveLength(2);
        expect(palette).toContainEqual({ r: 220, g: 20, b: 20 });
        expect(palette).toContainEqual({ r: 20, g: 20, b: 220 });
    });

    test("honours the ceiling it was given", () => {
        expect(buildPalette(image(["#o", "wk"]), 2)).toHaveLength(2);
    });

    test("transparency spends no palette entry, because a hole has no colour", () => {
        expect(buildPalette(image(["#.", ".#"]), 8)).toEqual([{ r: 220, g: 20, b: 20 }]);
    });

    test("a picture with nothing in it has no palette", () => {
        expect(buildPalette(image(["..", ".."]), 8)).toEqual([]);
    });
});

describe("mapToPalette", () => {
    test("sends every pixel to its own colour", () => {
        const pixels = image(["#o"]);
        const palette = buildPalette(pixels, 8);
        const indices = mapToPalette(pixels, palette);

        expect(palette[indices[0]]).toEqual({ r: 220, g: 20, b: 20 });
        expect(palette[indices[1]]).toEqual({ r: 20, g: 20, b: 220 });
    });

    test("a hole is -1, not a colour that happens to be near it", () => {
        const pixels = image(["#."]);

        expect([...mapToPalette(pixels, buildPalette(pixels, 8))]).toEqual([0, -1]);
    });

    test("an empty palette leaves everything a hole rather than throwing", () => {
        expect([...mapToPalette(image(["##"]), [])]).toEqual([-1, -1]);
    });
});

describe("labelComponents", () => {
    test("two patches of one colour are two regions", () => {
        const pixels = image(["#.#"]);
        const components = labelComponents(mapToPalette(pixels, buildPalette(pixels, 8)), {
            width: 3,
            height: 1,
        });

        expect(components.count).toBe(2);
        expect(components.indexOf[0]).toBe(components.indexOf[1]);
    });

    test("regions are four-connected, so a diagonal touch does not join them", () => {
        const pixels = image(["#.", ".#"]);
        const components = labelComponents(mapToPalette(pixels, buildPalette(pixels, 8)), {
            width: 2,
            height: 2,
        });

        expect(components.count).toBe(2);
    });

    test("members are grouped by label and every pixel is claimed once", () => {
        const pixels = image(["##", "#o"]);
        const components = labelComponents(mapToPalette(pixels, buildPalette(pixels, 8)), {
            width: 2,
            height: 2,
        });

        expect(components.count).toBe(2);
        expect(components.starts.at(-1)).toBe(4);
        expect(new Set(components.members)).toHaveLength(4);
    });
});

describe("despeckle", () => {
    test("a single stray pixel is absorbed by the field around it", () => {
        const pixels = image(["###", "#o#", "###"]);
        const palette = buildPalette(pixels, 8);
        const indices = mapToPalette(pixels, palette);
        const cleaned = despeckle(indices, size(pixels), 4);

        expect(new Set(cleaned)).toHaveLength(1);
    });

    test("nothing is touched when everything is big enough", () => {
        const pixels = image(["###", "#o#", "###"]);
        const palette = buildPalette(pixels, 8);
        const indices = mapToPalette(pixels, palette);

        expect([...despeckle(indices, size(pixels), 1)]).toEqual([...indices]);
    });

    test("a speck against nothing becomes nothing", () => {
        const pixels = image(["...", ".#.", "..."]);
        const palette = buildPalette(pixels, 8);
        const cleaned = despeckle(mapToPalette(pixels, palette), size(pixels), 4);

        expect([...cleaned].every((value) => value === -1)).toBe(true);
    });

    test("does not write over the map it was handed", () => {
        const pixels = image(["###", "#o#", "###"]);
        const indices = mapToPalette(pixels, buildPalette(pixels, 8));
        const before = [...indices];

        despeckle(indices, size(pixels), 4);

        expect([...indices]).toEqual(before);
    });
});

describe("traceComponent", () => {
    test("one pixel is one square loop of four corners", () => {
        const loops = loopsOf(image(["#"]));

        expect(loops).toHaveLength(1);
        expect(loops[0]).toHaveLength(4);
        expect(polygonArea(loops[0])).toBe(1);
    });

    test("a solid block is one loop that encloses every pixel in it", () => {
        const loops = loopsOf(image(["##", "##"]));

        expect(loops).toHaveLength(1);
        expect(polygonArea(loops[0])).toBe(4);
    });

    test("a hole comes out as a second loop, wound the other way", () => {
        const loops = loopsOf(image(["###", "#.#", "###"]));

        expect(loops).toHaveLength(2);

        const areas = loops.map(polygonArea).toSorted((a, b) => a - b);

        expect(areas).toEqual([-1, 9]);
        // The signed sum is the region's real area — which is what makes
        // `fill-rule="evenodd"` paint the hole as a hole.
        expect(areas[0] + areas[1]).toBe(8);
    });

    test("an L keeps its inner corner rather than cutting it off", () => {
        const loops = loopsOf(image(["#.", "##"]));

        expect(loops).toHaveLength(1);
        expect(polygonArea(loops[0])).toBe(3);
        expect(loops[0]).toContainEqual({ x: 1, y: 1 });
    });

    test("two colours are traced apart from each other", () => {
        expect(loopsOf(image(["#o", "#o"]))).toHaveLength(2);
    });
});

describe("simplifyPolygon", () => {
    test("drops the points a straight edge does not need", () => {
        const loops = loopsOf(image(["##", "##"]));
        const simplified = simplifyPolygon(loops[0], 0);

        expect(loops[0]).toHaveLength(8);
        expect(simplified).toHaveLength(4);
        expect(polygonArea(simplified)).toBe(4);
    });

    test("leaves a corner that carries the shape, even at zero tolerance", () => {
        const loops = loopsOf(image(["#.", "##"]));

        expect(simplifyPolygon(loops[0], 0)).toHaveLength(6);
    });

    test("flattens a one-pixel staircase into the diagonal it was drawn as", () => {
        const loops = loopsOf(image(["#..", "##.", "###"]));

        expect(simplifyPolygon(loops[0], 1).length).toBeLessThan(loops[0].length);
    });

    test("never invents a coordinate that was not on the grid", () => {
        const loops = loopsOf(image(["#..", "##.", "###"]));

        for (const point of simplifyPolygon(loops[0], 1.5)) {
            expect(Number.isInteger(point.x)).toBe(true);
            expect(Number.isInteger(point.y)).toBe(true);
        }
    });

    test("a loop too short to simplify is handed back", () => {
        const triangle = [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 0, y: 4 },
        ];

        expect(simplifyPolygon(triangle, 1)).toEqual(triangle);
    });
});

describe("polygonArea", () => {
    test("a unit square is one", () => {
        expect(
            polygonArea([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 0, y: 1 },
            ]),
        ).toBe(1);
    });

    test("the same square wound backwards is minus one", () => {
        expect(
            polygonArea([
                { x: 0, y: 1 },
                { x: 1, y: 1 },
                { x: 1, y: 0 },
                { x: 0, y: 0 },
            ]),
        ).toBe(-1);
    });
});

describe("toPathData and toHexColor", () => {
    test("writes one closed subpath per loop", () => {
        expect(
            toPathData([
                [
                    { x: 0, y: 0 },
                    { x: 2, y: 0 },
                    { x: 2, y: 2 },
                ],
            ]),
        ).toBe("M0 0L2 0L2 2Z");
    });

    test("subpaths run together, which is what makes the hole a hole", () => {
        const data = toPathData([
            [
                { x: 0, y: 0 },
                { x: 3, y: 0 },
                { x: 3, y: 3 },
            ],
            [
                { x: 1, y: 1 },
                { x: 2, y: 1 },
                { x: 2, y: 2 },
            ],
        ]);

        expect(data).toBe("M0 0L3 0L3 3ZM1 1L2 1L2 2Z");
    });

    test("colours are written as six-digit hex, padded", () => {
        expect(toHexColor({ r: 255, g: 0, b: 16 })).toBe("#ff0010");
        expect(toHexColor({ r: 0, g: 0, b: 0 })).toBe("#000000");
    });

    test("a channel out of range is clamped rather than written as nonsense", () => {
        expect(toHexColor({ r: 300, g: -20, b: 12.6 })).toBe("#ff000d");
    });
});

describe("tracePixelsToSvg", () => {
    const drawing = image(["##oo", "##oo", "wwkk", "wwkk"]);

    test("writes a document sized to the grid it traced", () => {
        const traced = tracePixelsToSvg(drawing, { colors: 8, quality: 100 });

        expect(traced.markup).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(traced.markup).toContain('width="4" height="4"');
        expect(traced.markup).toContain('viewBox="0 0 4 4"');
        expect(traced.markup).toEndWith("</svg>\n");
    });

    test("one path per fill, and the count is reported", () => {
        const traced = tracePixelsToSvg(drawing, { colors: 8, quality: 100 });

        expect(traced.colors).toBe(4);
        expect(traced.markup.match(/<path /g)).toHaveLength(4);
    });

    test("every path carries a fill and the even-odd rule", () => {
        const traced = tracePixelsToSvg(drawing, { colors: 8, quality: 100 });

        expect(traced.markup.match(/fill="#[0-9a-f]{6}"/g)).toHaveLength(4);
        expect(traced.markup.match(/fill-rule="evenodd"/g)).toHaveLength(4);
    });

    test("a smaller palette really is a smaller drawing", () => {
        const many = tracePixelsToSvg(drawing, { colors: 8, quality: 100 });
        const few = tracePixelsToSvg(drawing, { colors: 2, quality: 100 });

        expect(few.colors).toBe(2);
        expect(few.markup.length).toBeLessThan(many.markup.length);
    });

    test("holes survive the whole pipeline", () => {
        const ring = tracePixelsToSvg(image(["###", "#.#", "###"]), {
            colors: 4,
            quality: 100,
        });

        expect(ring.colors).toBe(1);
        // Two subpaths in one path: the outline and the hole inside it.
        expect(ring.markup.match(/M/g)).toHaveLength(2);
    });

    test("a picture with nothing in it traces to an empty drawing, not to a failure", () => {
        const empty = tracePixelsToSvg(image(["..", ".."]), { colors: 8, quality: 100 });

        expect(empty.colors).toBe(0);
        expect(empty.markup).not.toContain("<path");
        expect(empty.markup).toContain("</svg>");
    });

    test("every coordinate it writes is a whole number", () => {
        const traced = tracePixelsToSvg(image(["#..", "##.", "###"]), {
            colors: 4,
            quality: 60,
        });

        for (const number of traced.markup.match(/[ML](-?[\d.]+) (-?[\d.]+)/g) ?? []) {
            expect(number).not.toContain(".");
        }
    });
});
