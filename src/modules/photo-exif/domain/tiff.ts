const ORIENTATION_TAG = 0x0112;
const SHORT_TYPE = 3;

/** The `Exif\0\0` header an EXIF block carries before its TIFF bytes in JPEG and, often, WebP. */
export const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

export function hasExifHeader(bytes: Uint8Array): boolean {
    return EXIF_HEADER.every((byte, index) => bytes[index] === byte);
}

/** The TIFF bytes inside an EXIF block, with or without the `Exif\0\0` header. */
export function tiffOf(block: Uint8Array): Uint8Array {
    return hasExifHeader(block) ? block.subarray(EXIF_HEADER.length) : block;
}

/**
 * The orientation tag from IFD0, or `null` when there is none or the TIFF is
 * damaged. Read here rather than through the tag parser because the stripper
 * needs it synchronously, and it is the one tag the stripper writes back.
 */
export function readOrientation(tiff: Uint8Array): number | null {
    if (tiff.length < 8) {
        return null;
    }

    const little = tiff[0] === 0x49 && tiff[1] === 0x49;
    const big = tiff[0] === 0x4d && tiff[1] === 0x4d;

    if (!little && !big) {
        return null;
    }

    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const ifd = view.getUint32(4, little);

    if (ifd + 2 > tiff.length) {
        return null;
    }

    const count = view.getUint16(ifd, little);

    for (let index = 0; index < count; index++) {
        const entry = ifd + 2 + index * 12;

        if (entry + 12 > tiff.length) {
            return null;
        }

        if (view.getUint16(entry, little) === ORIENTATION_TAG) {
            if (view.getUint16(entry + 2, little) !== SHORT_TYPE) {
                return null;
            }

            const value = view.getUint16(entry + 8, little);

            return value >= 1 && value <= 8 ? value : null;
        }
    }

    return null;
}

/**
 * A TIFF holding one tag, the orientation, and nothing else: 26 bytes that
 * keep a sideways phone photo upright without a single other field.
 */
export function buildOrientationTiff(orientation: number): Uint8Array<ArrayBuffer> {
    const tiff = new Uint8Array(26);
    const view = new DataView(tiff.buffer);

    tiff.set([0x4d, 0x4d, 0x00, 0x2a]); // "MM", 42: big-endian TIFF
    view.setUint32(4, 8); // IFD0 straight after the header
    view.setUint16(8, 1); // one entry
    view.setUint16(10, ORIENTATION_TAG);
    view.setUint16(12, SHORT_TYPE);
    view.setUint32(14, 1); // count
    view.setUint16(18, orientation); // value, left-justified in the four bytes
    view.setUint32(22, 0); // no next IFD

    return tiff;
}
