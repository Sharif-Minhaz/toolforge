import type { RasterFormat } from "@/modules/tools/types";

/**
 * Writing the print resolution into the file.
 *
 * Without this, a 45 × 55 mm passport photograph is 532 × 650 pixels and
 * nothing else — and every program that prints it has to guess, which they do
 * differently: most assume 72 DPI, which puts that photograph on paper at
 * 188 × 229 mm. The pixels are right and the print is four times too big, and
 * the reader finds out at the counter.
 *
 * So the resolution goes in the file. Two formats can hold it and two cannot:
 *
 * - **PNG** has `pHYs`, in pixels per *metre*, with a unit byte.
 * - **JPEG** has the JFIF APP0 segment, in dots per inch or per centimetre.
 * - **WebP** and **AVIF** have no equivalent, and the UI disables the switch
 *   rather than writing something that will not be read.
 *
 * Both writers are byte surgery on an encoded file, which makes them exactly
 * the kind of thing to verify against something that is not this code — see the
 * case study. `identify -units PixelsPerInch -format "%x"` and Pillow's
 * `Image.info["dpi"]` both read what is written here.
 */

/** Exact by definition, and the reason PNG's unit is awkward. */
const MM_PER_INCH = 25.4;

const METRES_PER_INCH = MM_PER_INCH / 1_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** JFIF's densities are 16-bit, so the value has to fit. */
const MAX_JFIF_DENSITY = 65_535;

export function densityApplies(format: RasterFormat): boolean {
    return format === "png" || format === "jpeg";
}

/**
 * Puts the resolution into an encoded file, or hands the file back untouched.
 *
 * Untouched rather than thrown: a format with nowhere to put it is not an
 * error, and neither is a file this does not recognise. The switch in the UI is
 * disabled for the first case, and the second cannot happen with an encoder
 * from `image-codec.ts` — but a writer that corrupts a file it misread would be
 * a far worse bug than one that quietly does nothing.
 */
export function embedDensity(
    bytes: Uint8Array,
    format: RasterFormat,
    dpi: number,
): Uint8Array<ArrayBuffer> {
    const resolution = Math.max(1, Math.round(dpi));

    if (format === "png") {
        return writePngDensity(bytes, resolution);
    }

    if (format === "jpeg") {
        return writeJpegDensity(bytes, resolution);
    }

    return copyOf(bytes);
}

function copyOf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(bytes.length);

    out.set(bytes);

    return out;
}

/* -------------------------------------------------------------------------- */
/* PNG                                                                        */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
    const table = new Uint32Array(256);

    for (let index = 0; index < 256; index += 1) {
        let value = index;

        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }

        table[index] = value >>> 0;
    }

    return table;
}

/** The CRC-32 PNG puts after every chunk. Same polynomial a ZIP uses. */
export function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;

    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
    return (
        bytes.length > PNG_SIGNATURE.length &&
        PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
    );
}

function readUint32(bytes: Uint8Array, at: number): number {
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function writeUint32(target: Uint8Array, at: number, value: number): void {
    target[at] = (value >>> 24) & 0xff;
    target[at + 1] = (value >>> 16) & 0xff;
    target[at + 2] = (value >>> 8) & 0xff;
    target[at + 3] = value & 0xff;
}

/** `pHYs`: two pixels-per-unit counts and a unit byte, where 1 means metre. */
function buildPhysChunk(dpi: number): Uint8Array<ArrayBuffer> {
    const perMetre = Math.round(dpi / METRES_PER_INCH);
    const chunk = new Uint8Array(21);

    writeUint32(chunk, 0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    writeUint32(chunk, 8, perMetre);
    writeUint32(chunk, 12, perMetre);
    chunk[16] = 1;
    writeUint32(chunk, 17, crc32(chunk.subarray(4, 17)));

    return chunk;
}

/**
 * Inserts or replaces the `pHYs` chunk.
 *
 * The spec puts `pHYs` before the first `IDAT`, and a decoder that meets it
 * afterwards is entitled to ignore it — so the chunk list is walked rather than
 * assuming a fixed offset. An existing one is replaced in place; otherwise the
 * new chunk goes immediately before the first `IDAT`, which is the latest
 * position that is still correct and the one that requires knowing least about
 * what OxiPNG chose to write before it.
 */
function writePngDensity(bytes: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
    if (!isPng(bytes)) {
        return copyOf(bytes);
    }

    const chunk = buildPhysChunk(dpi);

    let offset = PNG_SIGNATURE.length;
    let insertAt = -1;
    let replaceAt = -1;
    let replaceLength = 0;

    while (offset + 8 <= bytes.length) {
        const length = readUint32(bytes, offset);
        const type = String.fromCharCode(
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        );
        const total = 12 + length;

        if (type === "pHYs") {
            replaceAt = offset;
            replaceLength = total;
            break;
        }

        if (type === "IDAT") {
            insertAt = offset;
            break;
        }

        if (type === "IEND") {
            insertAt = offset;
            break;
        }

        offset += total;
    }

    if (replaceAt >= 0) {
        const out = new Uint8Array(bytes.length - replaceLength + chunk.length);

        out.set(bytes.subarray(0, replaceAt), 0);
        out.set(chunk, replaceAt);
        out.set(bytes.subarray(replaceAt + replaceLength), replaceAt + chunk.length);

        return out;
    }

    if (insertAt < 0) {
        return copyOf(bytes);
    }

    const out = new Uint8Array(bytes.length + chunk.length);

    out.set(bytes.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(bytes.subarray(insertAt), insertAt + chunk.length);

    return out;
}

/* -------------------------------------------------------------------------- */
/* JPEG                                                                       */
/* -------------------------------------------------------------------------- */

const JFIF_TAG = [0x4a, 0x46, 0x49, 0x46, 0x00] as const;

function isJpeg(bytes: Uint8Array): boolean {
    return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function hasJfifTag(bytes: Uint8Array, at: number): boolean {
    return JFIF_TAG.every((byte, index) => bytes[at + index] === byte);
}

/**
 * Sets the JFIF density, adding the segment when the encoder left it out.
 *
 * MozJPEG writes an APP0 of its own, so the usual path is the patch. The insert
 * exists because "usually" is not "always" — a JPEG whose first marker is an
 * APP1 (Exif) is perfectly legal, and appending a JFIF APP0 straight after SOI
 * is where the spec says one goes.
 *
 * Segments are walked rather than assumed at offset 2, and the walk stops at
 * `SOS`: everything after that is entropy-coded data in which `FF E0` is a
 * coincidence rather than a marker.
 */
function writeJpegDensity(bytes: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
    if (!isJpeg(bytes)) {
        return copyOf(bytes);
    }

    const density = Math.min(MAX_JFIF_DENSITY, dpi);

    let offset = 2;

    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];

        // SOS, EOI, or a standalone marker: nothing further is a segment header.
        if (marker === 0xda || marker === 0xd9) {
            break;
        }

        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

        if (marker === 0xe0 && length >= 16 && hasJfifTag(bytes, offset + 4)) {
            const out = copyOf(bytes);

            out[offset + 11] = 1; // units: dots per inch
            out[offset + 12] = (density >> 8) & 0xff;
            out[offset + 13] = density & 0xff;
            out[offset + 14] = (density >> 8) & 0xff;
            out[offset + 15] = density & 0xff;

            return out;
        }

        offset += 2 + length;
    }

    const segment = new Uint8Array([
        0xff,
        0xe0,
        0x00,
        0x10,
        ...JFIF_TAG,
        0x01,
        0x02,
        0x01,
        (density >> 8) & 0xff,
        density & 0xff,
        (density >> 8) & 0xff,
        density & 0xff,
        0x00,
        0x00,
    ]);

    const out = new Uint8Array(bytes.length + segment.length);

    out.set(bytes.subarray(0, 2), 0);
    out.set(segment, 2);
    out.set(bytes.subarray(2), 2 + segment.length);

    return out;
}
