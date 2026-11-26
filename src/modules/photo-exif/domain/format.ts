import { STRIPPABLE_FORMATS, type PhotoFormat, type StrippableFormat } from "../types";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ISO-BMFF brands, from the `ftyp` box, that mean a HEIF still image. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
    return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * The container, from its first bytes. Never from the file name or the MIME
 * type a browser guessed: a `.jpg` that is really a PNG is the commonest way a
 * metadata stripper silently does nothing.
 */
export function detectPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "jpeg";
    }

    if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
        return "png";
    }

    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
        return "webp";
    }

    if (bytes.length >= 4) {
        const mark = ascii(bytes, 0, 4);

        if (mark === "II*\0" || mark === "MM\0*") {
            return "tiff";
        }
    }

    if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
        const brand = ascii(bytes, 8, 4);

        if (AVIF_BRANDS.has(brand)) {
            return "avif";
        }

        if (HEIC_BRANDS.has(brand)) {
            return "heic";
        }
    }

    return null;
}

export function isStrippable(format: PhotoFormat): format is StrippableFormat {
    return (STRIPPABLE_FORMATS as readonly string[]).includes(format);
}

export const FORMAT_MIME_TYPES: Readonly<Record<PhotoFormat, string>> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    avif: "image/avif",
    tiff: "image/tiff",
};

/** Proper names, the same in either language. */
export const FORMAT_LABELS: Readonly<Record<PhotoFormat, string>> = {
    jpeg: "JPEG",
    png: "PNG",
    webp: "WebP",
    heic: "HEIC",
    avif: "AVIF",
    tiff: "TIFF",
};
