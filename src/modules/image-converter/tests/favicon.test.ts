import { describe, expect, test } from "bun:test";

import {
    buildFaviconHeadHtml,
    buildWebManifest,
    FAVICON_ICO_NAME,
    FAVICON_ICO_SIZES,
    FAVICON_PNGS,
} from "@/modules/image-converter/domain/favicon";

describe("the pack's shape", () => {
    test("the ico carries the three sizes a browser actually asks for", () => {
        expect(FAVICON_ICO_SIZES).toEqual([16, 32, 48]);
    });

    test("every PNG has a distinct name and a square size", () => {
        expect(new Set(FAVICON_PNGS.map((png) => png.name)).size).toBe(FAVICON_PNGS.length);

        for (const png of FAVICON_PNGS) {
            expect(png.name).toEndWith(".png");
            expect(png.size).toBeGreaterThan(0);
        }
    });

    test("the two sizes an install prompt looks for are present", () => {
        const sizes = FAVICON_PNGS.map((png) => png.size);

        expect(sizes).toContain(192);
        expect(sizes).toContain(512);
    });

    test("iOS gets its 180", () => {
        expect(FAVICON_PNGS).toContainEqual({ name: "apple-touch-icon.png", size: 180 });
    });
});

describe("buildWebManifest", () => {
    test("is parseable JSON ending in a newline", () => {
        const manifest = buildWebManifest("holiday");

        expect(manifest).toEndWith("\n");
        expect(() => JSON.parse(manifest)).not.toThrow();
    });

    test("carries the name through to both name fields", () => {
        const manifest: unknown = JSON.parse(buildWebManifest("ছবি"));

        expect(manifest).toMatchObject({ name: "ছবি", short_name: "ছবি" });
    });

    test("lists only the two manifest icons, at root-relative paths", () => {
        const manifest = JSON.parse(buildWebManifest("x")) as {
            icons: { src: string; sizes: string; type: string; purpose: string }[];
        };

        expect(manifest.icons).toEqual([
            {
                src: "/web-app-manifest-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/web-app-manifest-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
        ]);
    });

    test("never claims maskable, because nothing here reserves a safe zone", () => {
        // A maskable icon may be cropped to a circle by the launcher. These are
        // scaled to fill the square, so the claim would cost somebody's logo
        // its edges on Android and nowhere else.
        expect(buildWebManifest("x")).not.toContain("maskable");
    });

    test("does not invent colours it cannot know", () => {
        const manifest = buildWebManifest("x");

        expect(manifest).not.toContain("theme_color");
        expect(manifest).not.toContain("background_color");
    });

    test("escapes a name that would otherwise break the JSON", () => {
        const manifest: unknown = JSON.parse(buildWebManifest('a"b\\c'));

        expect(manifest).toMatchObject({ name: 'a"b\\c' });
    });
});

describe("buildFaviconHeadHtml", () => {
    test("links every file the pack ships that a page has to reference", () => {
        const html = buildFaviconHeadHtml();

        expect(html).toContain(`href="/${FAVICON_ICO_NAME}"`);
        expect(html).toContain('href="/favicon-96x96.png"');
        expect(html).toContain('href="/apple-touch-icon.png"');
        expect(html).toContain('href="/site.webmanifest"');
    });

    test("declares the apple icon at the size the pack actually writes", () => {
        const apple = FAVICON_PNGS.find((png) => png.name === "apple-touch-icon.png");

        expect(buildFaviconHeadHtml()).toContain(`sizes="${apple?.size}x${apple?.size}"`);
    });

    test("is a set of self-closing link tags and nothing else", () => {
        const lines = buildFaviconHeadHtml().trimEnd().split("\n");

        expect(lines.length).toBe(4);

        for (const line of lines) {
            expect(line).toStartWith("<link rel=");
            expect(line).toEndWith("/>");
        }
    });
});
