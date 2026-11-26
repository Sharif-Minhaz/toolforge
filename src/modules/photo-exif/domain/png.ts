import type { ContainerRewrite, MetadataKind, StripOptions } from "../types";
import { UPRIGHT_ORIENTATION } from "./constants";
import { buildOrientationTiff, readOrientation, tiffOf } from "./tiff";

const SIGNATURE_LENGTH = 8;

/**
 * Ancillary chunks that describe how to show the picture: transparency,
 * colour, gamma, pixel size, animation. Every other ancillary chunk is
 * metadata. Critical chunks (an uppercase first letter) are always kept — a
 * decoder must refuse a file it cannot read them in.
 */
const PICTURE_CHUNKS = new Set([
    "tRNS",
    "gAMA",
    "cHRM",
    "sRGB",
    "sBIT",
    "bKGD",
    "pHYs",
    "sPLT",
    "hIST",
    "cICP",
    "mDCV",
    "cLLI",
    "acTL",
    "fcTL",
    "fdAT",
]);

const METADATA_CHUNKS: Readonly<Record<string, MetadataKind>> = {
    eXIf: "exif",
    tEXt: "text",
    zTXt: "text",
    iTXt: "text",
    tIME: "time",
    iCCP: "icc",
};

let crcTable: Uint32Array | null = null;

/** CRC-32 as PNG specifies it: polynomial 0xEDB88320, over the type and the data. */
function crc32(bytes: Uint8Array): number {
    if (crcTable === null) {
        crcTable = new Uint32Array(256);

        for (let n = 0; n < 256; n++) {
            let c = n;

            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c >>> 0;
        }
    }

    let crc = 0xffffffff;

    for (const byte of bytes) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, data.length);

    for (let index = 0; index < 4; index++) {
        chunk[4 + index] = type.charCodeAt(index);
    }

    chunk.set(data, 8);
    view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

    return chunk;
}

type Chunk = {
    readonly type: string;
    readonly start: number;
    readonly end: number;
    readonly data: Uint8Array;
};

/** Every chunk up to and including IEND, then whatever follows it; `null` if the file is damaged. */
function walk(bytes: Uint8Array): { chunks: Chunk[]; trailer: number } | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks: Chunk[] = [];
    let position = SIGNATURE_LENGTH;

    while (position + 12 <= bytes.length) {
        const length = view.getUint32(position);
        const end = position + 12 + length;

        if (end > bytes.length) {
            return null;
        }

        const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));

        chunks.push({
            type,
            start: position,
            end,
            data: bytes.subarray(position + 8, position + 8 + length),
        });
        position = end;

        if (type === "IEND") {
            return { chunks, trailer: bytes.length - position };
        }
    }

    return null;
}

/** The PNG with every metadata chunk dropped and each picture chunk copied unchanged, CRC and all. */
export function rewritePng(bytes: Uint8Array, options: StripOptions): ContainerRewrite | null {
    const walked = walk(bytes);

    if (walked === null) {
        return null;
    }

    const parts: Uint8Array[] = [bytes.subarray(0, SIGNATURE_LENGTH)];
    const removed: { kind: MetadataKind; bytes: number }[] = [];
    let orientation: number | null = null;
    let hadColorProfile = false;
    let firstImageData = -1;

    for (const chunk of walked.chunks) {
        const raw = bytes.subarray(chunk.start, chunk.end);
        const critical = chunk.type.charCodeAt(0) >= 0x41 && chunk.type.charCodeAt(0) <= 0x5a;

        if (chunk.type === "iCCP") {
            hadColorProfile = true;
        }

        if (chunk.type === "eXIf" && orientation === null) {
            orientation = readOrientation(tiffOf(chunk.data));
        }

        const keep =
            critical ||
            PICTURE_CHUNKS.has(chunk.type) ||
            (chunk.type === "iCCP" && options.keepColorProfile);

        if (keep) {
            // eXIf must come before the first IDAT, so that is where it goes back.
            if (chunk.type === "IDAT" && firstImageData === -1) {
                firstImageData = parts.length;
            }
            parts.push(raw);
            continue;
        }

        removed.push({ kind: METADATA_CHUNKS[chunk.type] ?? "other", bytes: raw.length });
    }

    if (walked.trailer > 0) {
        removed.push({ kind: "trailer", bytes: walked.trailer });
    }

    const kept =
        options.keepOrientation && orientation !== null && orientation !== UPRIGHT_ORIENTATION
            ? orientation
            : null;

    if (kept !== null && firstImageData !== -1) {
        parts.splice(firstImageData, 0, pngChunk("eXIf", buildOrientationTiff(kept)));
    }

    return { parts, removed, orientation: kept, hadColorProfile };
}

/** The TIFF bytes of the eXIf chunk, for reading. */
export function pngExif(bytes: Uint8Array): Uint8Array | null {
    const chunk = walk(bytes)?.chunks.find((candidate) => candidate.type === "eXIf");

    return chunk === undefined ? null : tiffOf(chunk.data);
}
