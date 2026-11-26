import type { ContainerRewrite, MetadataKind, StripOptions } from "../types";
import { UPRIGHT_ORIENTATION } from "./constants";
import { buildOrientationTiff, EXIF_HEADER, hasExifHeader, readOrientation } from "./tiff";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP13 = 0xed;
const APP14 = 0xee;
const COM = 0xfe;

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXTENSION_HEADER = "http://ns.adobe.com/xmp/extension/\0";
const ICC_HEADER = "ICC_PROFILE\0";

/** One piece of the file: a marker segment, a run of scan data, or what follows the end. */
type Piece =
    | {
          readonly kind: "segment";
          readonly marker: number;
          readonly start: number;
          readonly end: number;
      }
    | { readonly kind: "scan"; readonly start: number; readonly end: number }
    | { readonly kind: "trailer"; readonly start: number; readonly end: number };

function startsWith(bytes: Uint8Array, offset: number, text: string): boolean {
    if (offset + text.length > bytes.length) {
        return false;
    }

    for (let index = 0; index < text.length; index++) {
        if (bytes[offset + index] !== text.charCodeAt(index)) {
            return false;
        }
    }

    return true;
}

/** A marker with no length after it: SOI, EOI, the restart markers and TEM. */
function isStandalone(marker: number): boolean {
    return (
        marker === SOI || marker === EOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
    );
}

/**
 * The file split into marker segments and entropy-coded scan data, or `null`
 * if the structure is broken. Inside a scan a 0xFF is followed by 0x00 (a
 * stuffed byte) or a restart marker, so the next marker that is neither is
 * where the scan ends — which is how a progressive JPEG's many scans, with
 * Huffman tables between them, come apart cleanly.
 */
function walk(bytes: Uint8Array): Piece[] | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) {
        return null;
    }

    const pieces: Piece[] = [{ kind: "segment", marker: SOI, start: 0, end: 2 }];
    let position = 2;

    while (position < bytes.length) {
        if (bytes[position] !== 0xff) {
            return null;
        }

        // Any number of 0xFF fill bytes may precede a marker.
        let markerAt = position;

        while (markerAt + 1 < bytes.length && bytes[markerAt + 1] === 0xff) {
            markerAt++;
        }

        if (markerAt + 1 >= bytes.length) {
            return null;
        }

        const marker = bytes[markerAt + 1];

        if (marker === EOI) {
            pieces.push({ kind: "segment", marker, start: markerAt, end: markerAt + 2 });

            if (markerAt + 2 < bytes.length) {
                pieces.push({ kind: "trailer", start: markerAt + 2, end: bytes.length });
            }

            return pieces;
        }

        if (isStandalone(marker)) {
            pieces.push({ kind: "segment", marker, start: markerAt, end: markerAt + 2 });
            position = markerAt + 2;
            continue;
        }

        if (markerAt + 4 > bytes.length) {
            return null;
        }

        const length = (bytes[markerAt + 2] << 8) | bytes[markerAt + 3];
        const end = markerAt + 2 + length;

        if (length < 2 || end > bytes.length) {
            return null;
        }

        pieces.push({ kind: "segment", marker, start: markerAt, end });
        position = end;

        if (marker === SOS) {
            let scanEnd = position;

            while (scanEnd + 1 < bytes.length) {
                if (bytes[scanEnd] === 0xff) {
                    const next = bytes[scanEnd + 1];

                    if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) {
                        break;
                    }
                }
                scanEnd++;
            }

            // A file cut off inside its last scan has no EOI. Keep what is
            // there: refusing would lose the photo, and a truncated JPEG still
            // decodes down to where it stops.
            if (scanEnd + 1 >= bytes.length) {
                scanEnd = bytes.length;
            }

            pieces.push({ kind: "scan", start: position, end: scanEnd });
            position = scanEnd;
        }
    }

    return pieces;
}

/**
 * What a segment is, as far as the stripper cares: kept, or removed as one
 * kind of metadata. An allowlist — anything not named here as part of the
 * picture is metadata — because the segments a stripper misses are exactly
 * the ones nobody thought to list: a maker's APP3, a FLIR APP1, a
 * multi-picture APP2 whose second picture is the uncropped original.
 */
function classify(
    bytes: Uint8Array,
    marker: number,
    payload: number,
    options: StripOptions,
): MetadataKind | "keep" {
    if (marker < APP0 || (marker > 0xef && marker !== COM)) {
        return "keep";
    }

    if (marker === COM) {
        return "comment";
    }

    if (marker === APP0) {
        // JFIF says how to read the pixels; JFXX carries a thumbnail of them.
        return startsWith(bytes, payload, "JFIF\0") ? "keep" : "thumbnail";
    }

    if (marker === APP1) {
        if (hasExifHeader(bytes.subarray(payload))) {
            return "exif";
        }

        return startsWith(bytes, payload, XMP_HEADER) ||
            startsWith(bytes, payload, XMP_EXTENSION_HEADER)
            ? "xmp"
            : "other";
    }

    if (marker === APP2 && startsWith(bytes, payload, ICC_HEADER)) {
        return options.keepColorProfile ? "keep" : "icc";
    }

    if (marker === APP13) {
        return "iptc";
    }

    // Adobe's APP14 says whether the channels are RGB or YCbCr. Without it a
    // CMYK JPEG decodes in the wrong colours, so it is part of the picture.
    if (marker === APP14 && startsWith(bytes, payload, "Adobe")) {
        return "keep";
    }

    return "other";
}

function exifSegment(orientation: number): Uint8Array {
    const tiff = buildOrientationTiff(orientation);
    const length = 2 + EXIF_HEADER.length + tiff.length;
    const segment = new Uint8Array(2 + length);

    segment.set([0xff, APP1, length >> 8, length & 0xff]);
    segment.set(EXIF_HEADER, 4);
    segment.set(tiff, 4 + EXIF_HEADER.length);

    return segment;
}

/**
 * The JPEG rebuilt from the segments that describe the picture, with every
 * scan copied byte for byte — nothing is decoded, so nothing is re-encoded and
 * the pixels cannot change. `null` when the file is not a well-formed JPEG.
 */
export function rewriteJpeg(bytes: Uint8Array, options: StripOptions): ContainerRewrite | null {
    const pieces = walk(bytes);

    if (pieces === null) {
        return null;
    }

    const parts: Uint8Array[] = [];
    const removed: { kind: MetadataKind; bytes: number }[] = [];
    let orientation: number | null = null;
    let hadColorProfile = false;
    let exifInsertAt = -1;

    for (const piece of pieces) {
        const chunk = bytes.subarray(piece.start, piece.end);

        if (piece.kind === "trailer") {
            removed.push({ kind: "trailer", bytes: chunk.length });
            continue;
        }

        if (piece.kind === "scan") {
            parts.push(chunk);
            continue;
        }

        const payload = piece.start + 4;
        const verdict = classify(bytes, piece.marker, payload, options);

        if (piece.marker === APP2 && startsWith(bytes, payload, ICC_HEADER)) {
            hadColorProfile = true;
        }

        if (verdict === "exif" && orientation === null) {
            orientation = readOrientation(bytes.subarray(payload + EXIF_HEADER.length, piece.end));
        }

        if (verdict === "keep") {
            parts.push(chunk);

            // The new EXIF block goes straight after SOI, or after JFIF if the
            // file opens with one, which is where readers look for it.
            if (piece.marker === SOI || (piece.marker === APP0 && parts.length === 2)) {
                exifInsertAt = parts.length;
            }
            continue;
        }

        removed.push({ kind: verdict, bytes: chunk.length });
    }

    const kept =
        options.keepOrientation && orientation !== null && orientation !== UPRIGHT_ORIENTATION
            ? orientation
            : null;

    if (kept !== null) {
        parts.splice(exifInsertAt, 0, exifSegment(kept));
    }

    return { parts, removed, orientation: kept, hadColorProfile };
}

/** Text from every COM segment, which no tag parser reports and every camera app can write. */
export function readJpegComments(bytes: Uint8Array): string[] {
    const pieces = walk(bytes) ?? [];
    const decoder = new TextDecoder("utf-8", { fatal: false });

    return pieces
        .filter(
            (piece): piece is Extract<Piece, { kind: "segment" }> =>
                piece.kind === "segment" && piece.marker === COM,
        )
        .map((piece) =>
            decoder.decode(bytes.subarray(piece.start + 4, piece.end)).replace(/\0+$/, ""),
        )
        .filter((text) => text.length > 0);
}
