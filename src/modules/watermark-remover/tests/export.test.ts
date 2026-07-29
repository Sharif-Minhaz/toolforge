import { describe, expect, test } from "bun:test";

import { buildCleanImageFilename, toFilenameStem } from "@/modules/watermark-remover/domain/export";

const AT = new Date("2026-07-30T10:15:00.000Z");

describe("toFilenameStem", () => {
    const cases: readonly (readonly [string, string])[] = [
        ["photo.png", "photo"],
        ["My Photo (1).JPG", "my-photo-1"],
        ["screenshot 2026-07-30 at 10.15.png", "screenshot-2026-07-30-at-10-15"],
        ["archive.tar.gz", "archive-tar"],
        ["  spaced  name .webp", "spaced-name"],
        ["snake_case_name.png", "snake-case-name"],
    ];

    for (const [input, expected] of cases) {
        test(`reduces ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
            expect(toFilenameStem(input)).toBe(expected);
        });
    }

    const fallbacks = ["", "   ", "___", ".env", "!!!.png", "ছবি.png"];

    for (const input of fallbacks) {
        test(`falls back for ${JSON.stringify(input)}, which leaves nothing usable`, () => {
            expect(toFilenameStem(input)).toBe("image");
        });
    }

    test("caps a long name and never ends on a separator", () => {
        const stem = toFilenameStem(`${"a".repeat(60)}.png`);

        expect(stem).toBe("a".repeat(48));
        expect(stem.endsWith("-")).toBe(false);
    });

    test("trims a separator left behind by the cap", () => {
        // The 48th character is a space, so the slice would otherwise end on "-".
        const stem = toFilenameStem(`${"a".repeat(47)} tail.png`);

        expect(stem).toBe("a".repeat(47));
    });
});

describe("buildCleanImageFilename", () => {
    test("keeps the reader's own name, says what happened, and stays sortable", () => {
        expect(buildCleanImageFilename("My Photo.jpg", AT)).toBe(
            "my-photo-watermark-removed-20260730T101500Z.png",
        );
    });

    test("always ends in .png, whatever went in", () => {
        for (const name of ["a.jpg", "b.webp", "c.PNG", ""]) {
            expect(buildCleanImageFilename(name, AT).endsWith(".png")).toBe(true);
        }
    });

    test("carries no characters a filesystem would argue about", () => {
        expect(buildCleanImageFilename('bad:name/"*?.jpg', AT)).toMatch(
            /^bad-name-watermark-removed-\d{8}T\d{6}Z\.png$/,
        );
    });
});
