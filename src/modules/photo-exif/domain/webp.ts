import type { ContainerRewrite, MetadataBlocks, MetadataKind, StripOptions } from "../types";
import { UPRIGHT_ORIENTATION } from "./constants";
import { buildOrientationTiff, readOrientation, tiffOf } from "./tiff";

const HEADER_LENGTH = 12;

/** VP8X feature flags, from the WebP container spec. */
const FLAG_ICC = 0x20;
const FLAG_EXIF = 0x08;
const FLAG_XMP = 0x04;

/** Chunks that are the picture: features, colour profile, animation, alpha and the bitstreams. */
const PICTURE_CHUNKS = new Set(["VP8X", "ANIM", "ANMF", "ALPH", "VP8 ", "VP8L"]);

type Chunk = {
    readonly fourcc: string;
    readonly start: number;
    readonly end: number;
    readonly data: Uint8Array;
};

function walk(bytes: Uint8Array): { chunks: Chunk[]; end: number } | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const riffEnd = 8 + view.getUint32(4, true);

    if (riffEnd > bytes.length || riffEnd < HEADER_LENGTH) {
        return null;
    }

    const chunks: Chunk[] = [];
    let position = HEADER_LENGTH;

    while (position + 8 <= riffEnd) {
        const fourcc = String.fromCharCode(...bytes.subarray(position, position + 4));
        const size = view.getUint32(position + 4, true);
        // Every chunk is padded to an even length; the pad belongs to it.
        const end = position + 8 + size + (size % 2);

        if (position + 8 + size > riffEnd) {
            return null;
        }

        chunks.push({
            fourcc,
            start: position,
            end: Math.min(end, riffEnd),
            data: bytes.subarray(position + 8, position + 8 + size),
        });
        position = end;
    }

    return { chunks, end: riffEnd };
}

function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
    const padded = data.length + (data.length % 2);
    const chunk = new Uint8Array(8 + padded);

    for (let index = 0; index < 4; index++) {
        chunk[index] = fourcc.charCodeAt(index);
    }

    new DataView(chunk.buffer).setUint32(4, data.length, true);
    chunk.set(data, 8);

    return chunk;
}

/**
 * The WebP with its EXIF and XMP chunks dropped, the VP8X flags corrected to
 * match what is left, and the RIFF size rewritten. A simple WebP — one VP8 or
 * VP8L chunk and no VP8X — has nowhere to keep metadata, so it comes back
 * whole, less anything past the RIFF size.
 */
export function rewriteWebp(bytes: Uint8Array, options: StripOptions): ContainerRewrite | null {
    const walked = walk(bytes);

    if (walked === null) {
        return null;
    }

    const kept: Uint8Array[] = [];
    const removed: { kind: MetadataKind; bytes: number }[] = [];
    let orientation: number | null = null;
    let hadColorProfile = false;
    let keptIcc = false;
    let vp8xIndex = -1;

    for (const chunk of walked.chunks) {
        const raw = bytes.subarray(chunk.start, chunk.end);

        if (chunk.fourcc === "ICCP") {
            hadColorProfile = true;

            if (options.keepColorProfile) {
                keptIcc = true;
                kept.push(raw);
            } else {
                removed.push({ kind: "icc", bytes: raw.length });
            }
            continue;
        }

        if (PICTURE_CHUNKS.has(chunk.fourcc)) {
            if (chunk.fourcc === "VP8X") {
                vp8xIndex = kept.length;
            }
            kept.push(raw);
            continue;
        }

        if (chunk.fourcc === "EXIF" && orientation === null) {
            orientation = readOrientation(tiffOf(chunk.data));
        }

        removed.push({
            kind: chunk.fourcc === "EXIF" ? "exif" : chunk.fourcc === "XMP " ? "xmp" : "other",
            bytes: raw.length,
        });
    }

    if (walked.end < bytes.length) {
        removed.push({ kind: "trailer", bytes: bytes.length - walked.end });
    }

    const keptOrientation =
        options.keepOrientation &&
        orientation !== null &&
        orientation !== UPRIGHT_ORIENTATION &&
        vp8xIndex !== -1
            ? orientation
            : null;

    // EXIF sits after the image data in the extended layout.
    if (keptOrientation !== null) {
        kept.push(riffChunk("EXIF", buildOrientationTiff(keptOrientation)));
    }

    if (vp8xIndex !== -1) {
        const vp8x = kept[vp8xIndex].slice();
        let flags = vp8x[8] & ~(FLAG_ICC | FLAG_EXIF | FLAG_XMP);

        if (keptIcc) {
            flags |= FLAG_ICC;
        }

        if (keptOrientation !== null) {
            flags |= FLAG_EXIF;
        }

        vp8x[8] = flags;
        kept[vp8xIndex] = vp8x;
    }

    const bodyLength = kept.reduce((sum, part) => sum + part.length, 0);
    const header = bytes.slice(0, HEADER_LENGTH);

    new DataView(header.buffer).setUint32(4, 4 + bodyLength, true);

    return {
        parts: [header, ...kept],
        removed,
        orientation: keptOrientation,
        hadColorProfile,
    };
}

/** The EXIF, XMP and ICC chunks, for reading: the tag parser has no WebP reader of its own. */
export function webpBlocks(bytes: Uint8Array): MetadataBlocks | null {
    const walked = walk(bytes);

    if (walked === null) {
        return null;
    }

    const find = (fourcc: string) =>
        walked.chunks.find((chunk) => chunk.fourcc === fourcc)?.data ?? null;
    const exif = find("EXIF");

    return {
        tiff: exif === null ? null : tiffOf(exif),
        xmp: find("XMP "),
        icc: find("ICCP"),
        comments: [],
    };
}
