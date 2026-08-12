import { describe, expect, test } from "bun:test";

import { crc32, densityApplies, embedDensity } from "@/modules/image-resizer/domain/density";

/**
 * A minimal but structurally real PNG: signature, IHDR, IDAT, IEND. The pixel
 * data is nonsense, which is fine — nothing here decodes it, and what is under
 * test is where a chunk lands and what is in it.
 */
function png(withPhys = false): Uint8Array {
    const parts: number[][] = [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]];

    parts.push(chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));

    if (withPhys) {
        parts.push(chunk("pHYs", [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]));
    }

    parts.push(chunk("IDAT", [0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]));
    parts.push(chunk("IEND", []));

    return new Uint8Array(parts.flat());
}

function chunk(type: string, data: readonly number[]): number[] {
    const typeBytes = [...type].map((character) => character.charCodeAt(0));
    const body = new Uint8Array([...typeBytes, ...data]);
    const crc = crc32(body);

    return [...beUint32(data.length), ...typeBytes, ...data, ...beUint32(crc)];
}

function beUint32(value: number): number[] {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function findChunk(bytes: Uint8Array, type: string): number {
    const wanted = [...type].map((character) => character.charCodeAt(0));

    for (let at = 8; at + 8 <= bytes.length; at += 1) {
        if (wanted.every((byte, index) => bytes[at + index] === byte)) {
            return at;
        }
    }

    return -1;
}

/** SOI, a JFIF APP0 at 72 DPI, a token SOS, EOI. */
function jpegWithJfif(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0xff, 0xd9,
    ]);
}

/** SOI, an Exif APP1 and nothing else — legal, and missing the segment. */
function jpegWithoutJfif(): Uint8Array {
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00,
        0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
    ]);
}

describe("crc32", () => {
    test("matches the published check value", () => {
        // The CRC-32 of "123456789" is 0xCBF43926 in every implementation of
        // this polynomial, PNG's and ZIP's included.
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    });

    test("is empty-safe", () => {
        expect(crc32(new Uint8Array(0))).toBe(0);
    });
});

describe("densityApplies", () => {
    test("only the two formats that can hold a resolution", () => {
        expect(densityApplies("png")).toBe(true);
        expect(densityApplies("jpeg")).toBe(true);
        expect(densityApplies("webp")).toBe(false);
        expect(densityApplies("avif")).toBe(false);
    });
});

describe("embedDensity — PNG", () => {
    test("inserts pHYs before the first IDAT", () => {
        const written = embedDensity(png(), "png", 300);
        const phys = findChunk(written, "pHYs");
        const idat = findChunk(written, "IDAT");

        expect(phys).toBeGreaterThan(0);
        // A decoder is entitled to ignore a pHYs it meets after IDAT.
        expect(phys).toBeLessThan(idat);
    });

    test("writes 300 DPI as 11811 pixels per metre", () => {
        // 300 / 0.0254 = 11811.02…, which every reader rounds back to 300 DPI.
        const written = embedDensity(png(), "png", 300);
        const at = findChunk(written, "pHYs") + 4;
        const perMetre =
            (written[at] << 24) |
            (written[at + 1] << 16) |
            (written[at + 2] << 8) |
            written[at + 3];

        expect(perMetre).toBe(11_811);
        expect(written[at + 8]).toBe(1);
    });

    test("replaces an existing pHYs rather than adding a second", () => {
        const written = embedDensity(png(true), "png", 600);
        let count = 0;

        for (let at = 8; at + 4 <= written.length; at += 1) {
            if (
                written[at] === 0x70 &&
                written[at + 1] === 0x48 &&
                written[at + 2] === 0x59 &&
                written[at + 3] === 0x73
            ) {
                count += 1;
            }
        }

        expect(count).toBe(1);
        expect(written.length).toBe(png(true).length);
    });

    test("leaves a file it does not recognise untouched", () => {
        const notPng = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        expect([...embedDensity(notPng, "png", 300)]).toEqual([...notPng]);
    });
});

describe("embedDensity — JPEG", () => {
    test("patches the JFIF density in place", () => {
        const written = embedDensity(jpegWithJfif(), "jpeg", 300);

        expect(written.length).toBe(jpegWithJfif().length);
        expect(written[13]).toBe(1); // units: dots per inch
        expect((written[14] << 8) | written[15]).toBe(300);
        expect((written[16] << 8) | written[17]).toBe(300);
    });

    test("adds the segment when the encoder left it out", () => {
        const written = embedDensity(jpegWithoutJfif(), "jpeg", 300);

        expect(written[0]).toBe(0xff);
        expect(written[1]).toBe(0xd8);
        expect(written[2]).toBe(0xff);
        expect(written[3]).toBe(0xe0);
        expect((written[14] << 8) | written[15]).toBe(300);
        // The APP1 that was there is still there, after the new segment.
        expect(written[20]).toBe(0xff);
        expect(written[21]).toBe(0xe1);
    });

    test("caps at what a 16-bit field can hold", () => {
        const written = embedDensity(jpegWithJfif(), "jpeg", 100_000);

        expect((written[14] << 8) | written[15]).toBe(65_535);
    });

    test("leaves a file it does not recognise untouched", () => {
        const notJpeg = new Uint8Array([1, 2, 3, 4]);

        expect([...embedDensity(notJpeg, "jpeg", 300)]).toEqual([...notJpeg]);
    });
});

describe("embedDensity — formats with nowhere to put it", () => {
    test("hands the file back rather than throwing", () => {
        const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

        expect([...embedDensity(webp, "webp", 300)]).toEqual([...webp]);
        expect([...embedDensity(webp, "avif", 300)]).toEqual([...webp]);
    });
});
