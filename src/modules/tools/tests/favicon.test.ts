import { describe, expect, test } from "bun:test";

import {
    assembleFaviconPack,
    buildFaviconHeadHtml,
    buildWebManifest,
    FAVICON_ICO_NAME,
    FAVICON_ICO_SIZES,
    FAVICON_MANIFEST_NAME,
    FAVICON_MASKABLE_PNGS,
    FAVICON_PNGS,
    FAVICON_SNIPPET_NAME,
    ICO_MIME_TYPE,
} from "@/modules/tools/domain/favicon";

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

describe("buildWebManifest extras", () => {
    type Manifest = {
        icons: { src: string; purpose: string }[];
        theme_color?: string;
        background_color?: string;
    };

    test("without extras, writes exactly what the image converter always wrote", () => {
        // Pinned byte for byte: the converter's packs must not change because a
        // second tool learned to pass colours.
        expect(buildWebManifest("x")).toBe(
            [
                "{",
                '  "name": "x",',
                '  "short_name": "x",',
                '  "icons": [',
                "    {",
                '      "src": "/web-app-manifest-192x192.png",',
                '      "sizes": "192x192",',
                '      "type": "image/png",',
                '      "purpose": "any"',
                "    },",
                "    {",
                '      "src": "/web-app-manifest-512x512.png",',
                '      "sizes": "512x512",',
                '      "type": "image/png",',
                '      "purpose": "any"',
                "    }",
                "  ],",
                '  "display": "standalone"',
                "}",
                "",
            ].join("\n"),
        );
        expect(buildWebManifest("x", {})).toBe(buildWebManifest("x"));
    });

    test("writes the colours it is given", () => {
        const manifest = JSON.parse(
            buildWebManifest("x", { themeColor: "#4f46e5", backgroundColor: "#4f46e5" }),
        ) as Manifest;

        expect(manifest.theme_color).toBe("#4f46e5");
        expect(manifest.background_color).toBe("#4f46e5");
    });

    test("adds the maskable pair beside the any pair, never instead of it", () => {
        const manifest = JSON.parse(buildWebManifest("x", { maskable: true })) as Manifest;

        expect(manifest.icons.map((icon) => [icon.src, icon.purpose])).toEqual([
            ["/web-app-manifest-192x192.png", "any"],
            ["/web-app-manifest-512x512.png", "any"],
            ["/maskable-icon-192x192.png", "maskable"],
            ["/maskable-icon-512x512.png", "maskable"],
        ]);
    });

    test("the maskable names never collide with a pack PNG", () => {
        const names = new Set(FAVICON_PNGS.map((png) => png.name));

        for (const png of FAVICON_MASKABLE_PNGS) {
            expect(names.has(png.name)).toBe(false);
        }
    });
});

describe("assembleFaviconPack", () => {
    const png = (marker: number) => new Uint8Array([marker, marker]).buffer;

    test("lists the ico, the PNGs in order, then the manifest and the snippet", () => {
        const files = assembleFaviconPack(
            new Uint8Array([1, 2, 3]),
            [
                { name: "a.png", png: png(1) },
                { name: "b.png", png: png(2) },
            ],
            "{}\n",
        );

        expect(files.map((file) => file.name)).toEqual([
            FAVICON_ICO_NAME,
            "a.png",
            "b.png",
            FAVICON_MANIFEST_NAME,
            FAVICON_SNIPPET_NAME,
        ]);
    });

    test("types every member and counts its bytes", async () => {
        const files = assembleFaviconPack(
            new Uint8Array([1, 2, 3]),
            [{ name: "a.png", png: png(7) }],
            "{}\n",
        );

        // Bun appends `;charset=utf-8` to a text type; browsers keep it as given.
        expect(files.map((file) => file.blob.type.split(";")[0])).toEqual([
            ICO_MIME_TYPE,
            "image/png",
            "application/manifest+json",
            "text/html",
        ]);
        expect(files.map((file) => file.bytes)).toEqual([3, 2, 3, buildFaviconHeadHtml().length]);
        expect(await files[2].blob.text()).toBe("{}\n");
    });
});
