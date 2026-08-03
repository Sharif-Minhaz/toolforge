/**
 * The ICO container.
 *
 * An `.ico` is a six-byte header, one sixteen-byte directory entry per image,
 * and then the images themselves back to back. Every field is little-endian.
 * The payloads written here are complete PNG files rather than the older
 * headerless DIB-plus-AND-mask form: every browser, and Windows since Vista,
 * reads PNG-compressed entries, and a 48×48 DIB costs nine kilobytes where the
 * PNG costs a few hundred bytes.
 *
 * Nothing in this file touches a codec. It takes bytes that are already PNGs
 * and arranges them, which is what makes the container testable on its own —
 * the encoder that produced those bytes cannot be reached from `bun test`.
 */

export const ICO_HEADER_BYTES = 6;
export const ICO_DIRECTORY_ENTRY_BYTES = 16;

/** An ICO directory records the edge in one byte, so 256 is the ceiling. */
export const ICO_MAX_SIZE = 256;

export type IcoImage = {
    /** Square edge in pixels, 1 to 256. */
    readonly size: number;
    /** A complete PNG file. */
    readonly png: Uint8Array;
};

/**
 * Which images an ICO can actually describe, smallest first.
 *
 * A size outside 1–256 is dropped rather than clamped: clamping would write a
 * directory entry claiming a dimension the payload does not have, and every
 * reader trusts the directory. Duplicates are dropped too — two entries at the
 * same size make the picker's choice arbitrary.
 */
export function usableIcoImages(images: readonly IcoImage[]): readonly IcoImage[] {
    const seen = new Set<number>();

    return images
        .filter((image) => {
            if (!Number.isInteger(image.size) || image.size < 1 || image.size > ICO_MAX_SIZE) {
                return false;
            }

            if (seen.has(image.size)) {
                return false;
            }

            seen.add(image.size);

            return true;
        })
        .toSorted((a, b) => a.size - b.size);
}

/**
 * Packs PNGs into one `.ico`.
 *
 * An empty list still produces a structurally valid file — a header claiming
 * zero images — for the same reason an empty ZIP is still a ZIP: the caller
 * that hit that case gets a readable artefact instead of an exception to
 * special-case.
 */
export function buildIcoFile(images: readonly IcoImage[]): Uint8Array<ArrayBuffer> {
    const usable = usableIcoImages(images);
    const payloadStart = ICO_HEADER_BYTES + usable.length * ICO_DIRECTORY_ENTRY_BYTES;
    const total = usable.reduce((bytes, image) => bytes + image.png.length, payloadStart);

    const file = new Uint8Array(total);
    const view = new DataView(file.buffer);

    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // 1 = icon, 2 = cursor
    view.setUint16(4, usable.length, true);

    let offset = payloadStart;

    for (const [index, image] of usable.entries()) {
        const entry = ICO_HEADER_BYTES + index * ICO_DIRECTORY_ENTRY_BYTES;
        // 256 does not fit in a byte, and the format spells it `0`.
        const edge = image.size === ICO_MAX_SIZE ? 0 : image.size;

        view.setUint8(entry, edge);
        view.setUint8(entry + 1, edge);
        view.setUint8(entry + 2, 0); // palette entries; 0 for truecolour
        view.setUint8(entry + 3, 0); // reserved
        view.setUint16(entry + 4, 1, true); // colour planes
        view.setUint16(entry + 6, 32, true); // bits per pixel
        view.setUint32(entry + 8, image.png.length, true);
        view.setUint32(entry + 12, offset, true);

        file.set(image.png, offset);
        offset += image.png.length;
    }

    return file;
}
