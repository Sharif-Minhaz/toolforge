import type { PixelSize } from "@/modules/tools/types";

/**
 * A picture's pixel size, read from its header bytes without decoding it.
 *
 * The server has no canvas, and decoding an eight-megabyte JPEG to learn two
 * numbers that sit in its first kilobyte would be paying for the whole picture
 * to read its label. Every format a preview card accepts states its size near
 * the front, in a fixed place or after a short walk:
 *
 * | Format | Where                                                  |
 * | ------ | ------------------------------------------------------ |
 * | PNG    | `IHDR`, always the first chunk, bytes 16–23, big-endian |
 * | GIF    | logical screen, bytes 6–9, little-endian                |
 * | BMP    | the DIB header after byte 14; height may be negative    |
 * | WebP   | `VP8 `, `VP8L` or `VP8X`, each packed differently       |
 * | JPEG   | the first start-of-frame marker, after a segment walk   |
 * | AVIF   | an `ispe` property box inside `meta`                    |
 *
 * Returns `null` rather than guessing for anything it cannot read. A preview
 * check that says "unknown size" is honest; one that says 0 × 0 is a lie that
 * produces a "too small" finding for a picture that may be fine.
 *
 * Verified against `sharp`'s own metadata reader, which decodes with libvips —
 * see `docs/case-studies/link-preview.md`.
 */

function u16be(bytes: Uint8Array, at: number): number {
    return (bytes[at] << 8) | bytes[at + 1];
}

function u16le(bytes: Uint8Array, at: number): number {
    return bytes[at] | (bytes[at + 1] << 8);
}

function u24le(bytes: Uint8Array, at: number): number {
    return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
}

function u32be(bytes: Uint8Array, at: number): number {
    // `>>> 0` keeps the top bit from turning the result negative.
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function i32le(bytes: Uint8Array, at: number): number {
    return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
    let text = "";

    for (let index = at; index < at + length && index < bytes.length; index += 1) {
        text += String.fromCharCode(bytes[index]);
    }

    return text;
}

function sized(width: number, height: number): PixelSize | null {
    return width > 0 && height > 0 ? { width, height } : null;
}

function readPng(bytes: Uint8Array): PixelSize | null {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") {
        return null;
    }

    return sized(u32be(bytes, 16), u32be(bytes, 20));
}

function readGif(bytes: Uint8Array): PixelSize | null {
    return bytes.length < 10 ? null : sized(u16le(bytes, 6), u16le(bytes, 8));
}

function readBmp(bytes: Uint8Array): PixelSize | null {
    if (bytes.length < 26) {
        return null;
    }

    const headerSize = i32le(bytes, 14);

    // The 1990 OS/2 header stores 16-bit sizes; everything since stores 32-bit
    // signed ones, where a negative height means the rows run top-down.
    if (headerSize === 12) {
        return sized(u16le(bytes, 18), u16le(bytes, 20));
    }

    return sized(Math.abs(i32le(bytes, 18)), Math.abs(i32le(bytes, 22)));
}

function readWebp(bytes: Uint8Array): PixelSize | null {
    if (bytes.length < 30) {
        return null;
    }

    const chunk = ascii(bytes, 12, 4);

    if (chunk === "VP8X") {
        // Canvas size minus one, as two 24-bit little-endian fields.
        return sized(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
    }

    if (chunk === "VP8 ") {
        // A key frame's start code, then 14-bit sizes with two scaling bits on top.
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
            return null;
        }

        return sized(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
    }

    if (chunk === "VP8L") {
        if (bytes[20] !== 0x2f) {
            return null;
        }

        // Two 14-bit fields, each minus one, packed across four bytes.
        const b0 = bytes[21];
        const b1 = bytes[22];
        const b2 = bytes[23];
        const b3 = bytes[24];

        return sized(
            1 + (b0 | ((b1 & 0x3f) << 8)),
            1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
        );
    }

    return null;
}

/** Every start-of-frame marker: baseline, progressive, lossless, arithmetic. */
function isStartOfFrame(marker: number): boolean {
    return (
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    );
}

function readJpeg(bytes: Uint8Array): PixelSize | null {
    let at = 2;

    while (at + 9 < bytes.length) {
        if (bytes[at] !== 0xff) {
            return null;
        }

        const marker = bytes[at + 1];

        // Fill bytes: any number of 0xFF may precede a marker.
        if (marker === 0xff) {
            at += 1;
            continue;
        }

        // Standalone markers carry no length.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
            at += 2;
            continue;
        }

        if (isStartOfFrame(marker)) {
            // Length (2), precision (1), then height before width.
            return sized(u16be(bytes, at + 7), u16be(bytes, at + 5));
        }

        const length = u16be(bytes, at + 2);

        if (length < 2) {
            return null;
        }

        at += 2 + length;
    }

    return null;
}

/**
 * AVIF keeps its size in an `ispe` box, and a file can hold several — one for
 * the primary picture, one per grid tile, one for an alpha plane. Finding the
 * primary item properly means walking `iprp`/`ipma` associations; the largest
 * `ispe` is the primary in every encoder's output seen in practice (tiles and
 * auxiliary planes are never bigger than the picture they belong to), and is
 * what this returns.
 */
function readAvif(bytes: Uint8Array): PixelSize | null {
    let best: PixelSize | null = null;
    // The meta box sits near the front; a few kilobytes is generous.
    const limit = Math.min(bytes.length - 16, 64 * 1024);

    for (let at = 4; at < limit; at += 1) {
        if (bytes[at] !== 0x69 || ascii(bytes, at, 4) !== "ispe") {
            continue;
        }

        // `ispe` (4), version and flags (4), width (4), height (4).
        const candidate = sized(u32be(bytes, at + 8), u32be(bytes, at + 12));

        if (
            candidate !== null &&
            (best === null || candidate.width * candidate.height > best.width * best.height)
        ) {
            best = candidate;
        }
    }

    return best;
}

/** The pixel size of a picture, from its bytes alone; `null` when unreadable. */
export function readImageSize(bytes: Uint8Array): PixelSize | null {
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
        return readPng(bytes);
    }

    if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
        return readGif(bytes);
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return readJpeg(bytes);
    }

    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
        return readWebp(bytes);
    }

    if (ascii(bytes, 0, 2) === "BM") {
        return readBmp(bytes);
    }

    if (ascii(bytes, 4, 4) === "ftyp") {
        return readAvif(bytes);
    }

    return null;
}
