import { describe, expect, test } from "bun:test";

import {
    clampToPixels,
    findSvgRootTag,
    isSvgSource,
    parseSvgLength,
    parseViewBox,
    prepareSvgMarkup,
    readSvgIntrinsicSize,
    readSvgSize,
    resolveImageType,
    svgRasterSize,
    SVG_FALLBACK_EDGE,
} from "@/modules/image-converter/domain/svg-source";

function attributes(markup: string): ReadonlyMap<string, string> {
    const root = findSvgRootTag(markup);

    if (root === null) {
        throw new Error("no root tag");
    }

    return root.attributes;
}

describe("resolveImageType", () => {
    test("a declared type is taken at its word", () => {
        expect(resolveImageType({ type: "image/png", name: "logo.svg" })).toBe("image/png");
    });

    test("strips parameters and casing, like the shared gate does", () => {
        expect(resolveImageType({ type: "IMAGE/PNG; charset=binary", name: "x.png" })).toBe(
            "image/png",
        );
    });

    test("a .svg with no type at all is the file the picker offered", () => {
        expect(resolveImageType({ type: "", name: "logo.svg" })).toBe("image/svg+xml");
        expect(resolveImageType({ type: "application/octet-stream", name: "LOGO.SVG" })).toBe(
            "image/svg+xml",
        );
    });

    test("a typeless file that is not named .svg is left typeless", () => {
        expect(resolveImageType({ type: "", name: "logo.png" })).toBe("");
    });

    test("isSvgSource follows the same rule", () => {
        expect(isSvgSource({ type: "image/svg+xml", name: "a.txt" })).toBe(true);
        expect(isSvgSource({ type: "", name: "a.svg" })).toBe(true);
        expect(isSvgSource({ type: "image/png", name: "a.svg" })).toBe(false);
    });
});

describe("parseSvgLength", () => {
    test("reads a bare number as pixels", () => {
        expect(parseSvgLength("64")).toBe(64);
        expect(parseSvgLength("  64.5  ")).toBe(64.5);
    });

    test("converts the absolute CSS units", () => {
        expect(parseSvgLength("64px")).toBe(64);
        expect(parseSvgLength("1in")).toBe(96);
        expect(parseSvgLength("72pt")).toBe(96);
        expect(parseSvgLength("1pc")).toBe(16);
        expect(parseSvgLength("2.54cm")).toBeCloseTo(96, 6);
        expect(parseSvgLength("25.4mm")).toBeCloseTo(96, 6);
    });

    test("refuses a length that depends on a layout this tool does not have", () => {
        expect(parseSvgLength("100%")).toBeNull();
        expect(parseSvgLength("2em")).toBeNull();
        expect(parseSvgLength("3ex")).toBeNull();
    });

    test("refuses nothing, nonsense and non-positive values", () => {
        expect(parseSvgLength(undefined)).toBeNull();
        expect(parseSvgLength("wide")).toBeNull();
        expect(parseSvgLength("0")).toBeNull();
        expect(parseSvgLength("-10")).toBeNull();
    });
});

describe("parseViewBox", () => {
    test("reads the third and fourth numbers, which are the size", () => {
        expect(parseViewBox("0 0 24 16")).toEqual({ width: 24, height: 16 });
        expect(parseViewBox("-4 -4 32 32")).toEqual({ width: 32, height: 32 });
    });

    test("commas separate as well as spaces", () => {
        expect(parseViewBox("0,0,10,20")).toEqual({ width: 10, height: 20 });
    });

    test("refuses a box that is not four usable numbers", () => {
        expect(parseViewBox(undefined)).toBeNull();
        expect(parseViewBox("0 0 24")).toBeNull();
        expect(parseViewBox("0 0 24 wide")).toBeNull();
        expect(parseViewBox("0 0 0 24")).toBeNull();
    });
});

describe("readSvgIntrinsicSize", () => {
    test("width and height together are the size the author drew at", () => {
        expect(readSvgIntrinsicSize(attributes('<svg width="120" height="40">'))).toEqual({
            width: 120,
            height: 40,
        });
    });

    test("a viewBox alone still answers the question", () => {
        expect(readSvgIntrinsicSize(attributes('<svg viewBox="0 0 24 12">'))).toEqual({
            width: 24,
            height: 12,
        });
    });

    test("one dimension plus a viewBox takes the ratio from the box", () => {
        expect(readSvgIntrinsicSize(attributes('<svg width="48" viewBox="0 0 24 12">'))).toEqual({
            width: 48,
            height: 24,
        });
        expect(readSvgIntrinsicSize(attributes('<svg height="48" viewBox="0 0 24 12">'))).toEqual({
            width: 96,
            height: 48,
        });
    });

    test("a percentage width falls through to the viewBox rather than being guessed", () => {
        expect(
            readSvgIntrinsicSize(attributes('<svg width="100%" height="100%" viewBox="0 0 8 4">')),
        ).toEqual({ width: 8, height: 4 });
    });

    test("a file that declares nothing declares nothing", () => {
        expect(readSvgIntrinsicSize(attributes("<svg>"))).toBeNull();
    });
});

describe("svgRasterSize", () => {
    test("no declared size and no request lands on the fallback square", () => {
        expect(svgRasterSize(null, null)).toEqual({
            width: SVG_FALLBACK_EDGE,
            height: SVG_FALLBACK_EDGE,
        });
    });

    test("no request keeps the file's own size", () => {
        expect(svgRasterSize({ width: 24, height: 12 }, null)).toEqual({ width: 24, height: 12 });
    });

    test("a request is a target, not a cap — a vector is allowed to grow", () => {
        expect(svgRasterSize({ width: 24, height: 12 }, 512)).toEqual({ width: 512, height: 256 });
    });

    test("and it scales down just as readily", () => {
        expect(svgRasterSize({ width: 1000, height: 500 }, 100)).toEqual({
            width: 100,
            height: 50,
        });
    });

    test("the short edge never rounds away to nothing", () => {
        expect(svgRasterSize({ width: 4000, height: 3 }, 64)).toEqual({ width: 64, height: 1 });
    });
});

describe("clampToPixels", () => {
    test("a grid inside the budget is left exactly as it was", () => {
        const size = { width: 100, height: 50 };

        expect(clampToPixels(size, 40_000_000)).toBe(size);
    });

    test("an enormous declared size is drawn smaller rather than refused", () => {
        const clamped = clampToPixels({ width: 40_000, height: 40_000 }, 40_000_000);

        expect(clamped.width * clamped.height).toBeLessThanOrEqual(40_000_000);
        expect(clamped.width).toBe(clamped.height);
    });

    test("proportions survive the clamp", () => {
        const clamped = clampToPixels({ width: 8_000, height: 4_000 }, 1_000_000);

        expect(clamped.width / clamped.height).toBeCloseTo(2, 2);
        expect(clamped.width * clamped.height).toBeLessThanOrEqual(1_000_000);
    });

    test("a budget that says nothing clamps nothing", () => {
        const size = { width: 9_000, height: 9_000 };

        expect(clampToPixels(size, Number.POSITIVE_INFINITY)).toBe(size);
        expect(clampToPixels(size, 0)).toBe(size);
    });
});

describe("findSvgRootTag", () => {
    test("reads the attributes, whatever the spelling", () => {
        const found = attributes('<svg xmlns="urn:x" viewBox="0 0 4 4" WIDTH="8">');

        expect(found.get("viewbox")).toBe("0 0 4 4");
        expect(found.get("width")).toBe("8");
    });

    test("a > inside an attribute value does not end the tag", () => {
        const root = findSvgRootTag('<svg data-note="a > b" width="4"><rect /></svg>');

        expect(root?.attributes.get("width")).toBe("4");
        expect(root?.attributes.get("data-note")).toBe("a > b");
    });

    test("notices a self-closing root", () => {
        expect(findSvgRootTag('<svg width="4" />')?.selfClosing).toBe(true);
        expect(findSvgRootTag('<svg width="4">')?.selfClosing).toBe(false);
    });

    test("skips whatever came before it", () => {
        const markup = '<?xml version="1.0"?>\n<!-- drawn by hand -->\n<svg width="4"></svg>';

        expect(findSvgRootTag(markup)?.attributes.get("width")).toBe("4");
    });

    test("a file with no root tag has no root tag", () => {
        expect(findSvgRootTag("not markup at all")).toBeNull();
        expect(findSvgRootTag("<svgx width='4'>")).toBeNull();
    });
});

describe("prepareSvgMarkup", () => {
    test("replaces the declared size rather than adding a second one", () => {
        const prepared = prepareSvgMarkup('<svg width="24" height="12"><rect /></svg>', 240);

        expect(prepared?.size).toEqual({ width: 240, height: 120 });
        expect(prepared?.markup).toContain('width="240"');
        expect(prepared?.markup).toContain('height="120"');
        expect(prepared?.markup).not.toContain('width="24"');
    });

    test("synthesises the viewBox the resize needs, from the size that was declared", () => {
        // Without one, a bigger width only makes a bigger canvas — the drawing
        // stays the size it was, in the corner.
        const prepared = prepareSvgMarkup('<svg width="24" height="12"><rect /></svg>', 240);

        expect(prepared?.markup).toContain('viewBox="0 0 24 12"');
    });

    test("keeps a viewBox that was already there", () => {
        const prepared = prepareSvgMarkup('<svg viewBox="-2 -2 20 10" width="40"></svg>', 200);

        expect(prepared?.markup).toContain('viewBox="-2 -2 20 10"');
        expect(prepared?.size).toEqual({ width: 200, height: 100 });
    });

    test("adds the namespace, without which an <img> renders nothing", () => {
        const prepared = prepareSvgMarkup('<svg width="4" height="4"></svg>', null);

        expect(prepared?.markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    test("does not add a second namespace to a file that has one", () => {
        const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>';
        const prepared = prepareSvgMarkup(markup, null);
        const occurrences = prepared?.markup.match(/xmlns=/g) ?? [];

        expect(occurrences).toHaveLength(1);
    });

    test("leaves every other attribute, and the drawing itself, alone", () => {
        const markup = '<svg class="logo" width="4" height="4"><path d="M0 0h4v4z" /></svg>';
        const prepared = prepareSvgMarkup(markup, 8);

        expect(prepared?.markup).toContain('class="logo"');
        expect(prepared?.markup).toContain('<path d="M0 0h4v4z" />');
        expect(prepared?.markup).toEndWith("</svg>");
    });

    test("a self-closing root stays self-closing", () => {
        expect(prepareSvgMarkup('<svg width="4" height="4" />', null)?.markup).toEndWith("/>");
    });

    test("a file with nothing to go on is drawn at the fallback square", () => {
        const prepared = prepareSvgMarkup("<svg><rect /></svg>", null);

        expect(prepared?.size).toEqual({
            width: SVG_FALLBACK_EDGE,
            height: SVG_FALLBACK_EDGE,
        });
    });

    test("refuses a file that is not SVG, whatever it was called", () => {
        expect(prepareSvgMarkup("<html><body>hello</body></html>", 64)).toBeNull();
    });

    test("a drawing that declares more pixels than the tab holds is scaled, not refused", () => {
        const prepared = prepareSvgMarkup(
            '<svg width="40000" height="40000"></svg>',
            null,
            1_000_000,
        );

        expect(prepared).not.toBeNull();
        expect((prepared?.size.width ?? 0) * (prepared?.size.height ?? 0)).toBeLessThanOrEqual(
            1_000_000,
        );
        expect(prepared?.markup).toContain(`width="${prepared?.size.width}"`);
    });
});

describe("readSvgSize", () => {
    test("reports the declared size without touching the file", () => {
        expect(readSvgSize('<svg width="30" height="10"></svg>')).toEqual({
            width: 30,
            height: 10,
        });
    });

    test("a drawing that declares no size is still a drawing", () => {
        expect(readSvgSize("<svg></svg>")).toEqual({
            width: SVG_FALLBACK_EDGE,
            height: SVG_FALLBACK_EDGE,
        });
    });

    test("null is reserved for something that is not SVG at all", () => {
        expect(readSvgSize('{"json": true}')).toBeNull();
    });
});
