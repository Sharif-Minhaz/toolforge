import { describe, expect, test } from "bun:test";

import { DEFAULT_STRIP_OPTIONS } from "@/modules/photo-exif/domain/constants";
import { readPhotoMetadata } from "@/modules/photo-exif/domain/read";
import { stripPhoto } from "@/modules/photo-exif/domain/strip";
import { readOrientation } from "@/modules/photo-exif/domain/tiff";
import type { StripSuccess } from "@/modules/photo-exif/types";

import {
    fixture,
    JPEG_WITH_METADATA,
    JPEG_WITHOUT_METADATA,
    PNG_WITH_METADATA,
    WEBP_WITH_METADATA,
} from "./fixtures";

function strip(bytes: Uint8Array, options = DEFAULT_STRIP_OPTIONS): StripSuccess {
    const result = stripPhoto(bytes, options);

    if (!result.ok) {
        throw new Error(`expected a stripped file, got ${result.reason}`);
    }

    return result;
}

function kinds(result: StripSuccess): string[] {
    return result.removed.map((block) => block.kind);
}

/** From the first SOS marker to the end of EOI: the compressed picture itself. */
function jpegImageData(bytes: Uint8Array): Uint8Array {
    for (let index = 2; index + 1 < bytes.length; index++) {
        if (bytes[index] === 0xff && bytes[index + 1] === 0xda) {
            let end = bytes.length;

            for (let tail = bytes.length - 2; tail > index; tail--) {
                if (bytes[tail] === 0xff && bytes[tail + 1] === 0xd9) {
                    end = tail + 2;
                    break;
                }
            }

            return bytes.subarray(index, end);
        }
    }

    throw new Error("no SOS");
}

function pngChunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks: { type: string; data: Uint8Array }[] = [];

    for (let position = 8; position + 12 <= bytes.length;) {
        const length = view.getUint32(position);
        const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));

        chunks.push({ type, data: bytes.subarray(position + 8, position + 8 + length) });
        position += 12 + length;
    }

    return chunks;
}

function webpChunks(bytes: Uint8Array): string[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const names: string[] = [];

    for (let position = 12; position + 8 <= bytes.length;) {
        const size = view.getUint32(position + 4, true);

        names.push(String.fromCharCode(...bytes.subarray(position, position + 4)));
        position += 8 + size + (size % 2);
    }

    return names;
}

describe("stripping a JPEG", () => {
    const original = fixture(JPEG_WITH_METADATA);

    test("removes EXIF, XMP, IPTC, the comment and the bytes after EOI, and keeps the profile", () => {
        const result = strip(original);

        expect(result.format).toBe("jpeg");
        expect(kinds(result)).toEqual(["exif", "xmp", "iptc", "comment", "trailer"]);
        expect(result.keptColorProfile).toBe(true);
        expect(result.bytes.length).toBeLessThan(original.length);
    });

    test("copies the compressed picture byte for byte", () => {
        expect(jpegImageData(strip(original).bytes)).toEqual(jpegImageData(original));
    });

    test("writes back the orientation and nothing else", async () => {
        const result = strip(original);
        const read = await readPhotoMetadata(result.bytes);

        expect(result.keptOrientation).toBe(6);
        expect(read.ok).toBe(true);

        if (!read.ok) {
            return;
        }

        expect(read.facts.location).toBeNull();
        expect(read.facts.serialNumbers).toEqual([]);
        expect(read.facts.people).toEqual([]);
        expect(read.facts.takenAt).toBeNull();
        expect(read.facts.make).toBeNull();
        expect(
            read.groups.find((group) => group.id === "ifd0")?.tags.map((tag) => tag.key),
        ).toEqual(["Orientation"]);
        expect(read.findings).toEqual([]);
    });

    test("can drop the profile and the orientation too", async () => {
        const result = strip(original, { keepColorProfile: false, keepOrientation: false });
        const read = await readPhotoMetadata(result.bytes);

        expect(kinds(result)).toEqual(["exif", "xmp", "iptc", "icc", "comment", "trailer"]);
        expect(result.keptOrientation).toBeNull();
        expect(result.keptColorProfile).toBe(false);
        expect(read.ok && read.groups.map((group) => group.id)).toEqual(["jfif"]);
    });

    test("is idempotent", () => {
        const once = strip(original).bytes;

        expect(strip(once).bytes).toEqual(once);
    });

    test("leaves a file with nothing to remove unchanged", () => {
        const plain = fixture(JPEG_WITHOUT_METADATA);
        const result = strip(plain);

        expect(result.removed).toEqual([]);
        expect(result.bytes).toEqual(plain);
    });

    test("refuses a file whose structure is broken", () => {
        const broken = original.slice(0, 40);

        broken[5] = 0xff; // a segment length that runs past the end

        expect(stripPhoto(broken, DEFAULT_STRIP_OPTIONS)).toEqual({
            ok: false,
            reason: "malformed",
            format: "jpeg",
        });
    });
});

describe("stripping a PNG", () => {
    const original = fixture(PNG_WITH_METADATA);

    test("removes eXIf and the text chunks, keeps iCCP, and copies IDAT unchanged", () => {
        const result = strip(original);
        const before = pngChunks(original).filter((chunk) => chunk.type === "IDAT");
        const after = pngChunks(result.bytes);

        expect(kinds(result)).toEqual(["exif", "text"]);
        expect(after.filter((chunk) => chunk.type === "IDAT")).toEqual(before);
        expect(after.map((chunk) => chunk.type)).toEqual(["IHDR", "iCCP", "eXIf", "IDAT", "IEND"]);
    });

    test("the eXIf it writes holds the orientation", () => {
        const exif = pngChunks(strip(original).bytes).find((chunk) => chunk.type === "eXIf");

        expect(exif !== undefined && readOrientation(exif.data)).toBe(6);
    });
});

describe("stripping a WebP", () => {
    const original = fixture(WEBP_WITH_METADATA);

    test("removes EXIF and XMP, rewrites the flags and the RIFF size", () => {
        const result = strip(original, { keepColorProfile: true, keepOrientation: false });
        const view = new DataView(result.bytes.buffer);

        expect(kinds(result)).toEqual(["exif", "xmp"]);
        expect(webpChunks(result.bytes)).toEqual(["VP8X", "ICCP", "VP8L"]);
        expect(view.getUint32(4, true)).toBe(result.bytes.length - 8);
        // ICC set; EXIF and XMP cleared.
        expect(result.bytes[20] & 0x2c).toBe(0x20);
    });

    test("keeps a minimal EXIF chunk for the orientation, and says so in the flags", () => {
        const result = strip(original);

        expect(webpChunks(result.bytes)).toEqual(["VP8X", "ICCP", "VP8L", "EXIF"]);
        expect(result.bytes[20] & 0x08).toBe(0x08);
    });
});

describe("formats the stripper refuses", () => {
    test("names a HEIC file rather than calling it unknown", () => {
        const heic = new Uint8Array([
            0,
            0,
            0,
            24,
            ...new TextEncoder().encode("ftypheic"),
            0,
            0,
            0,
            0,
        ]);

        expect(stripPhoto(heic, DEFAULT_STRIP_OPTIONS)).toEqual({
            ok: false,
            reason: "unsupported_format",
            format: "heic",
        });
    });

    test("refuses something that is not a photo", () => {
        expect(stripPhoto(new TextEncoder().encode("hello"), DEFAULT_STRIP_OPTIONS)).toEqual({
            ok: false,
            reason: "unsupported_format",
        });
        expect(stripPhoto(new Uint8Array(), DEFAULT_STRIP_OPTIONS)).toEqual({
            ok: false,
            reason: "empty",
        });
    });
});
