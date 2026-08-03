import { describe, expect, test } from "bun:test";

import { buildZipArchive } from "@/modules/tools/domain/archive";

const STAMP = new Date("2026-08-03T10:15:00.000Z");

const LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
const CENTRAL_DIRECTORY = [0x50, 0x4b, 0x01, 0x02];
const END_OF_CENTRAL_DIRECTORY = [0x50, 0x4b, 0x05, 0x06];

function indexOfSignature(archive: Uint8Array, signature: readonly number[]): number {
    return Buffer.from(archive).indexOf(Buffer.from(signature));
}

function countSignature(archive: Uint8Array, signature: readonly number[]): number {
    const haystack = Buffer.from(archive);
    const needle = Buffer.from(signature);

    let count = 0;
    let from = 0;

    for (;;) {
        const at = haystack.indexOf(needle, from);

        if (at === -1) {
            return count;
        }

        count += 1;
        from = at + needle.length;
    }
}

/** The general-purpose bit flag of the first local file header. */
function firstEntryFlags(archive: Uint8Array): number {
    return archive[6] | (archive[7] << 8);
}

/** The compression method of the first local file header; 0 is "stored". */
function firstEntryMethod(archive: Uint8Array): number {
    return archive[8] | (archive[9] << 8);
}

describe("buildZipArchive", () => {
    test("writes the three structures every reader looks for", () => {
        const archive = buildZipArchive(
            [{ name: "a-min.webp", bytes: Uint8Array.from([1, 2, 3]) }],
            STAMP,
        );

        expect(indexOfSignature(archive, LOCAL_HEADER)).toBe(0);
        expect(indexOfSignature(archive, CENTRAL_DIRECTORY)).toBeGreaterThan(0);
        expect(indexOfSignature(archive, END_OF_CENTRAL_DIRECTORY)).toBeGreaterThan(0);
    });

    test("stores rather than deflates, because the members are already compressed", () => {
        const archive = buildZipArchive(
            [{ name: "a.webp", bytes: Uint8Array.from({ length: 4096 }, (_, i) => i % 251) }],
            STAMP,
        );

        expect(firstEntryMethod(archive)).toBe(0);
    });

    test("marks entry names as UTF-8, so a Bangla filename survives the round trip", () => {
        const archive = buildZipArchive([{ name: "ছবি-min.webp", bytes: Uint8Array.of(1) }], STAMP);

        expect(firstEntryFlags(archive) & 0x800).toBe(0x800);
    });

    test("writes one local header per entry", () => {
        const entries = Array.from({ length: 5 }, (_, index) => ({
            name: `file-${index}.webp`,
            bytes: Uint8Array.of(index),
        }));

        expect(countSignature(buildZipArchive(entries, STAMP), LOCAL_HEADER)).toBe(5);
    });

    test("carries every payload through byte for byte", () => {
        const payload = Uint8Array.from({ length: 256 }, (_, index) => index);
        const archive = buildZipArchive([{ name: "raw.bin", bytes: payload }], STAMP);

        expect(Buffer.from(archive).includes(Buffer.from(payload))).toBe(true);
    });

    test("an empty archive is still a valid, readable ZIP", () => {
        const archive = buildZipArchive([], STAMP);

        expect(indexOfSignature(archive, END_OF_CENTRAL_DIRECTORY)).toBe(0);
        expect(archive.length).toBe(22);
    });

    test("is deterministic for the same entries and the same instant", () => {
        const entries = [{ name: "a.webp", bytes: Uint8Array.of(9, 9, 9) }];

        expect(buildZipArchive(entries, STAMP)).toEqual(buildZipArchive(entries, STAMP));
    });

    test("an entry with no bytes is written rather than dropped", () => {
        const archive = buildZipArchive([{ name: "empty.webp", bytes: new Uint8Array() }], STAMP);

        expect(countSignature(archive, LOCAL_HEADER)).toBe(1);
    });
});
