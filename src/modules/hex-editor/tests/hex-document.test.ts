import { describe, expect, test } from "bun:test";

import { MAX_FILE_BYTES } from "@/modules/hex-editor/domain/constants";
import { acceptFileBytes, HexDocument } from "@/modules/hex-editor/domain/hex-document";

function open(values: readonly number[], name = "sample.bin"): HexDocument {
    return new HexDocument(Uint8Array.from(values), name);
}

describe("HexDocument", () => {
    test("reads the bytes it was opened with", () => {
        const document = open([0x48, 0x65, 0x6c]);

        expect(document.length).toBe(3);
        expect(document.getByte(0)).toBe(0x48);
        expect(document.getByte(2)).toBe(0x6c);
    });

    test("answers 0 past the end, so the short last row needs no bounds check", () => {
        expect(open([0x01]).getByte(9)).toBe(0);
    });

    test("overwrites a byte without touching the bytes around it", () => {
        const document = open([0x00, 0x4d, 0x00]);

        expect(document.setByte(1, 0xaf)).toEqual({ offset: 1, previous: 0x4d, next: 0xaf });
        expect(document.getByte(1)).toBe(0xaf);
        expect(document.getByte(0)).toBe(0x00);
        expect(document.getByte(2)).toBe(0x00);
    });

    test("is clean until something differs from the file", () => {
        const document = open([0x4d]);

        expect(document.dirty).toBe(false);

        document.setByte(0, 0xaf);

        expect(document.dirty).toBe(true);
    });

    /**
     * The keystroke that types a byte's existing value back over it is not an
     * edit, and an undo stack that holds one restores a value already on screen.
     */
    test("reports nothing for a write that changes nothing", () => {
        const document = open([0x4d]);

        expect(document.setByte(0, 0x4d)).toBeNull();
        expect(document.dirty).toBe(false);
    });

    /** Typing a byte back to what it was on disk makes the document clean again. */
    test("drops the edit when a byte is typed back to its original value", () => {
        const document = open([0x4d]);

        document.setByte(0, 0xaf);
        document.setByte(0, 0x4d);

        expect(document.dirty).toBe(false);
        expect(document.editedOffsets).toEqual([]);
    });

    test("lists edited offsets in ascending order", () => {
        const document = open([0, 0, 0, 0]);

        document.setByte(3, 0xff);
        document.setByte(1, 0xff);

        expect(document.editedOffsets).toEqual([1, 3]);
        expect(document.editCount).toBe(2);
    });

    test("refuses an offset outside the document", () => {
        expect(() => open([0x00]).setByte(1, 0)).toThrow(RangeError);
        expect(() => open([0x00]).setByte(-1, 0)).toThrow(RangeError);
    });

    test("refuses a value that is not a byte", () => {
        expect(() => open([0x00]).setByte(0, 256)).toThrow(RangeError);
        expect(() => open([0x00]).setByte(0, -1)).toThrow(RangeError);
        expect(() => open([0x00]).setByte(0, 1.5)).toThrow(RangeError);
    });

    test("slices with the edits already applied", () => {
        const document = open([1, 2, 3, 4, 5]);

        document.setByte(2, 0x99);

        expect([...document.slice(1, 4)]).toEqual([2, 0x99, 4]);
    });

    test("clamps a slice to the document rather than padding it", () => {
        const document = open([1, 2, 3]);

        expect([...document.slice(-5, 99)]).toEqual([1, 2, 3]);
        expect([...document.slice(2, 1)]).toEqual([]);
    });

    test("saves the whole file with the edits in it", () => {
        const document = open([0x00, 0x00]);

        document.setByte(1, 0x2a);

        expect([...document.save()]).toEqual([0x00, 0x2a]);
    });

    test("keeps the name it was opened under", () => {
        expect(open([1], "firmware.rom").name).toBe("firmware.rom");
    });

    test("applies a recorded edit, which is how undo and redo write", () => {
        const document = open([0x10]);

        document.applyEdit({ offset: 0, previous: 0x10, next: 0x20 });

        expect(document.getByte(0)).toBe(0x20);
    });
});

describe("acceptFileBytes", () => {
    test("takes an ordinary file", () => {
        const result = acceptFileBytes(Uint8Array.from([1, 2]));

        expect(result.ok).toBe(true);
    });

    test("refuses an empty file by name", () => {
        expect(acceptFileBytes(new Uint8Array(0))).toEqual({ ok: false, reason: "empty_file" });
    });

    test("refuses a file past the ceiling by name", () => {
        // Only the length is read, so this costs nothing to construct.
        const oversized = { length: MAX_FILE_BYTES + 1 } as Uint8Array;

        expect(acceptFileBytes(oversized)).toEqual({ ok: false, reason: "too_large" });
    });
});
