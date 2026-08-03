import { describe, expect, test } from "bun:test";

import { buildArchivePaths } from "@/modules/image-converter/domain/outputs";

describe("buildArchivePaths", () => {
    test("a batch of single-file rows stays flat", () => {
        expect(
            buildArchivePaths([
                { sourceName: "a.png", fileNames: ["a.webp"] },
                { sourceName: "b.png", fileNames: ["b.webp"] },
            ]),
        ).toEqual(["a.webp", "b.webp"]);
    });

    test("a row that produced several files gets a folder of its own", () => {
        expect(
            buildArchivePaths([
                { sourceName: "holiday.png", fileNames: ["favicon.ico", "site.webmanifest"] },
            ]),
        ).toEqual(["holiday/favicon.ico", "holiday/site.webmanifest"]);
    });

    test("two packs do not collide, because each keeps its own folder", () => {
        // Flattened, these would be favicon.ico and favicon-2.ico, and nobody
        // could tell which picture the second one came from.
        expect(
            buildArchivePaths([
                { sourceName: "logo.png", fileNames: ["favicon.ico", "head.html"] },
                { sourceName: "mark.png", fileNames: ["favicon.ico", "head.html"] },
            ]),
        ).toEqual(["logo/favicon.ico", "logo/head.html", "mark/favicon.ico", "mark/head.html"]);
    });

    test("two sources that clean down to the same folder are still disambiguated", () => {
        const paths = buildArchivePaths([
            { sourceName: "my logo.png", fileNames: ["favicon.ico", "head.html"] },
            { sourceName: "my/logo.png", fileNames: ["favicon.ico", "head.html"] },
        ]);

        expect(new Set(paths).size).toBe(4);
        expect(paths[0]).toBe("my-logo/favicon.ico");
    });

    test("repeated single-file names are numbered rather than overwritten", () => {
        expect(
            buildArchivePaths([
                { sourceName: "a.png", fileNames: ["shot.webp"] },
                { sourceName: "b.png", fileNames: ["shot.webp"] },
            ]),
        ).toEqual(["shot.webp", "shot-2.webp"]);
    });

    test("cleans a source name before it becomes a folder", () => {
        expect(
            buildArchivePaths([
                { sourceName: "../../etc/passwd.png", fileNames: ["favicon.ico", "head.html"] },
            ]),
        ).toEqual(["etc-passwd/favicon.ico", "etc-passwd/head.html"]);
    });

    test("mixes flat rows and foldered rows in one archive", () => {
        expect(
            buildArchivePaths([
                { sourceName: "a.png", fileNames: ["a.webp"] },
                { sourceName: "b.png", fileNames: ["favicon.ico", "head.html"] },
            ]),
        ).toEqual(["a.webp", "b/favicon.ico", "b/head.html"]);
    });

    test("an empty batch produces no paths", () => {
        expect(buildArchivePaths([])).toEqual([]);
    });

    test("a row with no files contributes nothing", () => {
        expect(buildArchivePaths([{ sourceName: "a.png", fileNames: [] }])).toEqual([]);
    });

    test("returns one path per file, all distinct", () => {
        const rows = Array.from({ length: 20 }, () => ({
            sourceName: "same.png",
            fileNames: ["favicon.ico", "head.html", "site.webmanifest"],
        }));
        const paths = buildArchivePaths(rows);

        expect(paths.length).toBe(60);
        expect(new Set(paths).size).toBe(60);
    });
});
