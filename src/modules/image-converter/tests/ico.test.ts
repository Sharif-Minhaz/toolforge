import { describe, expect, test } from "bun:test";

import {
    buildIcoFile,
    ICO_DIRECTORY_ENTRY_BYTES,
    ICO_HEADER_BYTES,
    ICO_MAX_SIZE,
    usableIcoImages,
    type IcoImage,
} from "@/modules/image-converter/domain/ico";

/**
 * The payloads are not real PNGs — this file tests the container, and the
 * encoder that produces the real ones cannot be reached from `bun test`. Each
 * fake carries a recognisable byte so a misplaced offset shows up as the wrong
 * picture rather than as a length that happens to match.
 */
function fakePng(size: number, marker: number, length = 8): IcoImage {
    return { size, png: Uint8Array.from({ length }, () => marker) };
}

function read(file: Uint8Array, offset: number, bytes: 1 | 2 | 4): number {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);

    if (bytes === 1) {
        return view.getUint8(offset);
    }

    return bytes === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true);
}

function entryAt(file: Uint8Array, index: number): number {
    return ICO_HEADER_BYTES + index * ICO_DIRECTORY_ENTRY_BYTES;
}

describe("buildIcoFile — header", () => {
    test("reserved is zero and the type says icon, not cursor", () => {
        const file = buildIcoFile([fakePng(16, 0xa1)]);

        expect(read(file, 0, 2)).toBe(0);
        expect(read(file, 2, 2)).toBe(1);
    });

    test("the count matches the entries that were written", () => {
        const file = buildIcoFile([fakePng(16, 1), fakePng(32, 2), fakePng(48, 3)]);

        expect(read(file, 4, 2)).toBe(3);
    });

    test("an empty list is still a structurally valid file", () => {
        const file = buildIcoFile([]);

        expect(file.length).toBe(ICO_HEADER_BYTES);
        expect(read(file, 4, 2)).toBe(0);
    });
});

describe("buildIcoFile — directory", () => {
    test("records each square's edge in both dimension bytes", () => {
        const file = buildIcoFile([fakePng(16, 1), fakePng(48, 2)]);

        expect(read(file, entryAt(file, 0), 1)).toBe(16);
        expect(read(file, entryAt(file, 0) + 1, 1)).toBe(16);
        expect(read(file, entryAt(file, 1), 1)).toBe(48);
        expect(read(file, entryAt(file, 1) + 1, 1)).toBe(48);
    });

    test("writes 256 as zero, which is what the format means by it", () => {
        const file = buildIcoFile([fakePng(ICO_MAX_SIZE, 9)]);

        expect(read(file, entryAt(file, 0), 1)).toBe(0);
        expect(read(file, entryAt(file, 0) + 1, 1)).toBe(0);
    });

    test("declares one plane at 32 bits, and no palette", () => {
        const file = buildIcoFile([fakePng(32, 7)]);
        const entry = entryAt(file, 0);

        expect(read(file, entry + 2, 1)).toBe(0);
        expect(read(file, entry + 3, 1)).toBe(0);
        expect(read(file, entry + 4, 2)).toBe(1);
        expect(read(file, entry + 6, 2)).toBe(32);
    });

    test("every payload's length and offset are recorded correctly", () => {
        const images = [fakePng(16, 0xaa, 5), fakePng(32, 0xbb, 11), fakePng(48, 0xcc, 3)];
        const file = buildIcoFile(images);

        let expected = ICO_HEADER_BYTES + images.length * ICO_DIRECTORY_ENTRY_BYTES;

        for (const [index, image] of images.entries()) {
            const entry = entryAt(file, index);

            expect(read(file, entry + 8, 4)).toBe(image.png.length);
            expect(read(file, entry + 12, 4)).toBe(expected);
            expected += image.png.length;
        }
    });

    test("the first payload begins exactly where the directory ends", () => {
        const file = buildIcoFile([fakePng(16, 1), fakePng(32, 2)]);

        expect(read(file, entryAt(file, 0) + 12, 4)).toBe(
            ICO_HEADER_BYTES + 2 * ICO_DIRECTORY_ENTRY_BYTES,
        );
    });
});

describe("buildIcoFile — payloads", () => {
    test("each recorded offset points at that image's own bytes", () => {
        const images = [fakePng(16, 0x11, 4), fakePng(32, 0x22, 6), fakePng(48, 0x33, 5)];
        const file = buildIcoFile(images);

        for (const [index, image] of images.entries()) {
            const offset = read(file, entryAt(file, index) + 12, 4);

            expect([...file.subarray(offset, offset + image.png.length)]).toEqual([...image.png]);
        }
    });

    test("the file is exactly the header, the directory and the payloads", () => {
        const images = [fakePng(16, 1, 7), fakePng(32, 2, 9)];

        expect(buildIcoFile(images).length).toBe(
            ICO_HEADER_BYTES + 2 * ICO_DIRECTORY_ENTRY_BYTES + 7 + 9,
        );
    });

    test("a zero-byte payload still gets an entry that points somewhere valid", () => {
        const file = buildIcoFile([fakePng(16, 0, 0), fakePng(32, 5, 4)]);

        expect(read(file, entryAt(file, 0) + 8, 4)).toBe(0);
        expect(read(file, entryAt(file, 1) + 12, 4)).toBe(
            ICO_HEADER_BYTES + 2 * ICO_DIRECTORY_ENTRY_BYTES,
        );
    });
});

describe("usableIcoImages", () => {
    test("sorts ascending regardless of the order they arrived in", () => {
        const sizes = usableIcoImages([fakePng(48, 1), fakePng(16, 2), fakePng(32, 3)]);

        expect(sizes.map((image) => image.size)).toEqual([16, 32, 48]);
    });

    test("keeps the first of two entries at the same size", () => {
        const kept = usableIcoImages([fakePng(32, 0xaa), fakePng(32, 0xbb)]);

        expect(kept.length).toBe(1);
        expect(kept[0].png[0]).toBe(0xaa);
    });

    test("drops a size the directory cannot describe rather than clamping it", () => {
        // Clamping would write an entry claiming a dimension the payload does
        // not have, and every reader trusts the directory over the payload.
        expect(usableIcoImages([fakePng(512, 1), fakePng(0, 2), fakePng(-8, 3)])).toEqual([]);
    });

    test("keeps both ends of the legal range", () => {
        const kept = usableIcoImages([fakePng(1, 1), fakePng(ICO_MAX_SIZE, 2)]);

        expect(kept.map((image) => image.size)).toEqual([1, ICO_MAX_SIZE]);
    });

    test("drops a fractional size", () => {
        expect(usableIcoImages([fakePng(16.5, 1)])).toEqual([]);
    });

    test("dropping a size also drops its payload from the file", () => {
        const file = buildIcoFile([fakePng(16, 1, 4), fakePng(999, 2, 4)]);

        expect(read(file, 4, 2)).toBe(1);
        expect(file.length).toBe(ICO_HEADER_BYTES + ICO_DIRECTORY_ENTRY_BYTES + 4);
    });
});
