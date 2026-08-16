import { describe, expect, test } from "bun:test";

import {
    buildCompositeFilename,
    COMPOSITE_EXTENSIONS,
    COMPOSITE_MIME_TYPES,
    defaultCompositeFormat,
    keepsAlpha,
} from "../domain/filenames";
import { COMPOSITE_FORMATS, type BackgroundChoice } from "../types";

const TRANSPARENT: BackgroundChoice = { kind: "transparent" };
const WHITE: BackgroundChoice = { kind: "color", color: "#ffffff" };

describe("buildCompositeFilename", () => {
    test("names a cut-out for what happened to it", () => {
        expect(buildCompositeFilename("portrait.jpg", TRANSPARENT, "png")).toBe(
            "portrait-cutout.png",
        );
    });

    test("names anything with something behind it a background", () => {
        expect(buildCompositeFilename("portrait.jpg", WHITE, "jpeg")).toBe(
            "portrait-background.jpg",
        );
    });

    test("replaces the original extension rather than appending to it", () => {
        expect(buildCompositeFilename("shot.HEIC", TRANSPARENT, "png")).toBe("shot-cutout.png");
    });

    test("keeps a non-Latin name, because somebody who named a file in Bangla gets it back", () => {
        expect(buildCompositeFilename("ছবি.jpg", TRANSPARENT, "png")).toBe("ছবি-cutout.png");
    });

    test("survives a name that is nothing but an extension", () => {
        expect(buildCompositeFilename(".png", TRANSPARENT, "png")).toBe("image-cutout.png");
    });

    test("writes jpg rather than jpeg, which is what an operating system expects", () => {
        expect(buildCompositeFilename("a.png", WHITE, "jpeg").endsWith(".jpg")).toBe(true);
    });
});

describe("defaultCompositeFormat", () => {
    test("a cut-out with nothing behind it defaults to the format that keeps alpha", () => {
        expect(defaultCompositeFormat(TRANSPARENT)).toBe("png");
    });

    test("anything opaque defaults to the smaller lossy format", () => {
        expect(defaultCompositeFormat(WHITE)).toBe("jpeg");
        expect(defaultCompositeFormat({ kind: "blur", strength: 40 })).toBe("jpeg");
        expect(
            defaultCompositeFormat({
                kind: "image",
                url: "https://x/y.jpg",
                credit: null,
                description: "",
            }),
        ).toBe("jpeg");
    });
});

describe("keepsAlpha", () => {
    test("only JPEG drops the channel", () => {
        expect(keepsAlpha("png")).toBe(true);
        expect(keepsAlpha("webp")).toBe(true);
        expect(keepsAlpha("jpeg")).toBe(false);
    });
});

describe("format tables", () => {
    test("every format has an extension and a MIME type", () => {
        for (const format of COMPOSITE_FORMATS) {
            expect(COMPOSITE_EXTENSIONS[format]).toBeTruthy();
            expect(COMPOSITE_MIME_TYPES[format]).toMatch(/^image\//);
        }
    });

    test("no two formats share a MIME type", () => {
        const types = COMPOSITE_FORMATS.map((format) => COMPOSITE_MIME_TYPES[format]);

        expect(new Set(types).size).toBe(COMPOSITE_FORMATS.length);
    });
});
