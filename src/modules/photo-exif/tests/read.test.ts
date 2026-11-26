import { describe, expect, test } from "bun:test";

import { detectPhotoFormat } from "@/modules/photo-exif/domain/format";
import { readPhotoMetadata } from "@/modules/photo-exif/domain/read";
import type { ReadSuccess } from "@/modules/photo-exif/types";

import {
    fixture,
    JPEG_WITH_METADATA,
    JPEG_WITHOUT_METADATA,
    PNG_WITH_METADATA,
    WEBP_WITH_METADATA,
} from "./fixtures";

async function read(base64: string): Promise<ReadSuccess> {
    const result = await readPhotoMetadata(fixture(base64));

    if (!result.ok) {
        throw new Error(`expected metadata, got ${result.reason}`);
    }

    return result;
}

describe("detectPhotoFormat", () => {
    test("reads the container from its first bytes", () => {
        expect(detectPhotoFormat(fixture(JPEG_WITH_METADATA))).toBe("jpeg");
        expect(detectPhotoFormat(fixture(PNG_WITH_METADATA))).toBe("png");
        expect(detectPhotoFormat(fixture(WEBP_WITH_METADATA))).toBe("webp");
        expect(detectPhotoFormat(new TextEncoder().encode("II*\0rest"))).toBe("tiff");
        expect(
            detectPhotoFormat(new Uint8Array([0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102])),
        ).toBe("avif");
        expect(detectPhotoFormat(new TextEncoder().encode("GIF89a"))).toBeNull();
    });
});

describe("readPhotoMetadata", () => {
    test("draws the facts out of a JPEG", async () => {
        const { facts, format } = await read(JPEG_WITH_METADATA);

        expect(format).toBe("jpeg");
        expect(facts).toMatchObject({
            make: "ToolForge Test Cam",
            model: "TF-1",
            lens: "TF 50mm F1.8",
            software: "FixtureMaker 1.0",
            takenAt: "2024-05-01 14:30:15 +06:00",
            exposure: "1/250 s",
            aperture: "f/2.8",
            iso: "ISO 200",
            focalLength: "50 mm",
            serialNumbers: ["SN-12345678"],
        });
        expect(facts.people).toContain("Jane Doe");
        expect(facts.location?.latitude).toBeCloseTo(23 + 48 / 60 + 36 / 3600, 9);
        expect(facts.location?.longitude).toBeCloseTo(90 + 24 / 60 + 54 / 3600, 9);
        expect(facts.location?.altitude).toBe(12);
    });

    test("names everything that identifies someone, location first", async () => {
        const { findings } = await read(JPEG_WITH_METADATA);

        expect(findings).toEqual([
            "location",
            "people",
            "serial",
            "time",
            "device",
            "software",
            "comment",
        ]);
    });

    test("groups every tag, the comment included", async () => {
        const { groups, tagCount } = await read(JPEG_WITH_METADATA);
        const ids = groups.map((group) => group.id);

        expect(ids).toEqual(["ifd0", "exif", "gps", "xmp", "iptc", "icc", "jfif", "comment"]);
        expect(groups.at(-1)?.tags).toEqual([
            { key: "Comment", value: { kind: "text", text: "secret comment" } },
        ]);
        expect(tagCount).toBe(groups.reduce((sum, group) => sum + group.tags.length, 0));
    });

    test("reads a WebP through the same parser", async () => {
        const { facts, groups } = await read(WEBP_WITH_METADATA);

        expect(facts.make).toBe("ToolForge Test Cam");
        expect(facts.location?.latitude).toBeCloseTo(23.81, 2);
        expect(groups.map((group) => group.id)).toContain("xmp");
    });

    test("reads a PNG's eXIf chunk", async () => {
        const { facts } = await read(PNG_WITH_METADATA);

        expect(facts.serialNumbers).toEqual(["SN-12345678"]);
    });

    test("a photo with nothing in it has no findings", async () => {
        const { findings, facts } = await read(JPEG_WITHOUT_METADATA);

        expect(findings).toEqual([]);
        expect(facts.location).toBeNull();
    });

    test("refuses what it cannot read", async () => {
        expect(await readPhotoMetadata(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
        expect(await readPhotoMetadata(new TextEncoder().encode("not a photo"))).toEqual({
            ok: false,
            reason: "unsupported_format",
        });
    });
});
