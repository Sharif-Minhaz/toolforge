import { describe, expect, test } from "bun:test";

import {
    buildArchiveFilename,
    buildOutputFilename,
    FORMAT_EXTENSIONS,
    FORMAT_MIME_TYPES,
    toFilenameStem,
    uniqueFilenames,
} from "@/modules/image-compressor/domain/filenames";
import { ENCODED_FORMATS } from "@/modules/image-compressor/types";

describe("toFilenameStem", () => {
    test("drops only the final extension", () => {
        expect(toFilenameStem("holiday.jpg")).toBe("holiday");
        expect(toFilenameStem("archive.tar.gz")).toBe("archive.tar");
    });

    test("keeps a name that has no extension", () => {
        expect(toFilenameStem("screenshot")).toBe("screenshot");
    });

    test("keeps non-Latin names rather than slugging them away", () => {
        expect(toFilenameStem("ছবি.png")).toBe("ছবি");
        expect(toFilenameStem("写真.jpg")).toBe("写真");
    });

    test("replaces whitespace so the name survives a shell", () => {
        expect(toFilenameStem("my holiday photo.jpg")).toBe("my-holiday-photo");
    });

    test("strips path separators, so a pick cannot choose a directory", () => {
        expect(toFilenameStem("../../etc/passwd.png")).toBe("etc-passwd");
        expect(toFilenameStem("C:\\Users\\me\\pic.jpg")).toBe("C-Users-me-pic");
    });

    test("strips the characters Windows refuses", () => {
        expect(toFilenameStem('a<b>c:d"e|f?g*h.png')).toBe("a-b-c-d-e-f-g-h");
    });

    test("strips control characters", () => {
        expect(toFilenameStem("photo\u0000\u001f\u007fname.png")).toBe("photo-name");
    });

    test("cannot produce a hidden file", () => {
        expect(toFilenameStem(".hidden.png")).toBe("hidden");
        expect(toFilenameStem("...png")).toBe("image");
    });

    test("falls back when nothing usable is left", () => {
        expect(toFilenameStem(".jpg")).toBe("image");
        expect(toFilenameStem("   .png")).toBe("image");
        expect(toFilenameStem("")).toBe("image");
    });

    test("caps the length so a pathological name cannot break a filesystem", () => {
        expect(toFilenameStem(`${"a".repeat(500)}.png`).length).toBe(64);
    });

    test("collapses a run of replacements into one separator", () => {
        expect(toFilenameStem("a    b.png")).toBe("a-b");
    });
});

describe("buildOutputFilename", () => {
    test("names the file after the reader's own, plus what happened to it", () => {
        expect(buildOutputFilename("holiday.png", "webp")).toBe("holiday-min.webp");
    });

    test("uses jpg rather than jpeg, which is what a camera roll expects", () => {
        expect(buildOutputFilename("photo.png", "jpeg")).toBe("photo-min.jpg");
    });

    test("every format has an extension and a MIME type", () => {
        for (const format of ENCODED_FORMATS) {
            expect(FORMAT_EXTENSIONS[format].length).toBeGreaterThan(0);
            expect(FORMAT_MIME_TYPES[format]).toStartWith("image/");
            expect(buildOutputFilename("x.bin", format)).toBe(`x-min.${FORMAT_EXTENSIONS[format]}`);
        }
    });
});

describe("uniqueFilenames", () => {
    test("leaves distinct names alone", () => {
        expect(uniqueFilenames(["a-min.webp", "b-min.webp"])).toEqual(["a-min.webp", "b-min.webp"]);
    });

    test("numbers the repeats and keeps the first as it was", () => {
        expect(uniqueFilenames(["shot-min.webp", "shot-min.webp", "shot-min.webp"])).toEqual([
            "shot-min.webp",
            "shot-min-2.webp",
            "shot-min-3.webp",
        ]);
    });

    test("puts the number before the extension so sorting still works", () => {
        expect(uniqueFilenames(["a.png", "a.png"])[1]).toEndWith(".png");
    });

    test("treats names that differ only in case as the same", () => {
        expect(uniqueFilenames(["Shot.webp", "shot.webp"])).toEqual(["Shot.webp", "shot-2.webp"]);
    });

    test("does not collide with a name that already looks disambiguated", () => {
        expect(uniqueFilenames(["a.png", "a-2.png", "a.png"])).toEqual([
            "a.png",
            "a-2.png",
            "a-3.png",
        ]);
    });

    test("handles a name with no extension", () => {
        expect(uniqueFilenames(["readme", "readme"])).toEqual(["readme", "readme-2"]);
    });

    test("returns as many names as it was given, all distinct", () => {
        const names = Array.from({ length: 40 }, () => "same.webp");
        const result = uniqueFilenames(names);

        expect(result.length).toBe(40);
        expect(new Set(result).size).toBe(40);
    });

    test("an empty list stays empty", () => {
        expect(uniqueFilenames([])).toEqual([]);
    });
});

describe("buildArchiveFilename", () => {
    test("stamps the instant so downloads sort chronologically", () => {
        expect(buildArchiveFilename(new Date("2026-08-03T10:15:00.000Z"))).toBe(
            "toolforge-images-20260803T101500Z.zip",
        );
    });

    test("drops the milliseconds but keeps the zone marker", () => {
        expect(buildArchiveFilename(new Date("2026-01-02T03:04:05.678Z"))).toBe(
            "toolforge-images-20260102T030405Z.zip",
        );
    });
});
