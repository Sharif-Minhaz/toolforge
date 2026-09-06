import { describe, expect, test } from "bun:test";

import { decodeFloat16, readInspector } from "@/modules/hex-editor/domain/inspector";
import { INSPECTOR_KEYS, type Endianness, type InspectorKey } from "@/modules/hex-editor/types";

function read(values: readonly number[], endian: Endianness, key: InspectorKey): string | null {
    const readings = readInspector(Uint8Array.from(values), endian);

    return readings.find((reading) => reading.key === key)?.value ?? null;
}

const SIXTEEN = [
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
];

describe("readInspector", () => {
    test("returns every row, in a fixed order", () => {
        const readings = readInspector(Uint8Array.from(SIXTEEN), "little");

        expect(readings.map((reading) => reading.key)).toEqual([...INSPECTOR_KEYS]);
    });

    test("names each row after the type, not after a translation", () => {
        const readings = readInspector(Uint8Array.from([1]), "little");

        expect(readings.find((reading) => reading.key === "uint24")?.label).toBe("UInt24");
        expect(readings.find((reading) => reading.key === "guid")?.label).toBe("GUID");
    });

    test("reads binary and octal from the single byte at the caret", () => {
        expect(read([0x4d], "little", "binary")).toBe("01001101");
        expect(read([0x4d], "little", "octal")).toBe("115");
        expect(read([0x00], "little", "binary")).toBe("00000000");
        expect(read([0x07], "little", "octal")).toBe("007");
    });

    test("reads the one-byte integers, signed and unsigned", () => {
        expect(read([0xff], "little", "uint8")).toBe("255");
        expect(read([0xff], "little", "int8")).toBe("-1");
        expect(read([0x80], "little", "int8")).toBe("-128");
    });

    test("reads 16- and 32-bit integers in both byte orders", () => {
        expect(read([0x01, 0x02], "little", "uint16")).toBe("513");
        expect(read([0x01, 0x02], "big", "uint16")).toBe("258");
        expect(read([0xff, 0xff], "little", "int16")).toBe("-1");
        expect(read([0x01, 0x02, 0x03, 0x04], "little", "uint32")).toBe("67305985");
        expect(read([0x01, 0x02, 0x03, 0x04], "big", "uint32")).toBe("16909060");
    });

    /** No `DataView` accessor exists for three bytes, so this one is by hand. */
    test("reads the 24-bit integers, signed and unsigned", () => {
        expect(read([0x01, 0x02, 0x03], "little", "uint24")).toBe("197121");
        expect(read([0x01, 0x02, 0x03], "big", "uint24")).toBe("66051");
        expect(read([0xff, 0xff, 0xff], "little", "uint24")).toBe("16777215");
        expect(read([0xff, 0xff, 0xff], "little", "int24")).toBe("-1");
        expect(read([0x00, 0x00, 0x80], "little", "int24")).toBe("-8388608");
        expect(read([0xff, 0xff, 0x7f], "little", "int24")).toBe("8388607");
    });

    test("reads the 64-bit integers past what a number can hold", () => {
        const bytes = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

        expect(read(bytes, "little", "uint64")).toBe("18446744073709551615");
        expect(read(bytes, "little", "int64")).toBe("-1");
    });

    test("reads the wider floats", () => {
        expect(read([0x00, 0x00, 0x80, 0x3f], "little", "float32")).toBe("1");
        expect(read([0x3f, 0x80, 0x00, 0x00], "big", "float32")).toBe("1");
        expect(read([0, 0, 0, 0, 0, 0, 0xf0, 0x3f], "little", "float64")).toBe("1");
    });

    test("shows the ASCII character, or a dot", () => {
        expect(read([0x48], "little", "ascii")).toBe("H");
        expect(read([0x00], "little", "ascii")).toBe(".");
    });

    test("reads a UTF-16 code unit in the chosen byte order", () => {
        expect(read([0x41, 0x00], "little", "utf16")).toBe("A");
        expect(read([0x00, 0x41], "big", "utf16")).toBe("A");
    });

    /** A lone surrogate is not a character; U+FFFD would read as one. */
    test("refuses a lone UTF-16 surrogate rather than showing a replacement", () => {
        expect(read([0x00, 0xd8], "little", "utf16")).toBeNull();
        expect(read([0x00, 0xdc], "little", "utf16")).toBeNull();
    });

    test("joins a UTF-16 surrogate pair when both halves are there", () => {
        expect(read([0x3d, 0xd8, 0x00, 0xde], "little", "utf16")).toBe("😀");
    });

    /**
     * Cross-checked against the platform's own decoder for the sequences it and
     * this agree are valid — `TextDecoder` is a second implementation, and the
     * one every browser will be measured against.
     */
    test("agrees with TextDecoder on valid UTF-8 sequences", () => {
        const decoder = new TextDecoder("utf-8", { fatal: true });

        for (const character of ["A", "é", "€", "😀", "অ"]) {
            const bytes = new TextEncoder().encode(character);

            expect(read([...bytes], "little", "utf8")).toBe(decoder.decode(bytes));
        }
    });

    test("refuses malformed, truncated and overlong UTF-8", () => {
        expect(read([0xff], "little", "utf8")).toBeNull();
        expect(read([0x80], "little", "utf8")).toBeNull();
        // Truncated: a three-byte lead with only two bytes present.
        expect(read([0xe2, 0x82], "little", "utf8")).toBeNull();
        // Overlong: "A" written in two bytes.
        expect(read([0xc1, 0x81], "little", "utf8")).toBeNull();
        // A surrogate half, which no encoder should ever have written.
        expect(read([0xed, 0xa0, 0x80], "little", "utf8")).toBeNull();
    });

    test("UTF-8 reports how many bytes the character took", () => {
        const readings = readInspector(new TextEncoder().encode("€"), "little");

        expect(readings.find((reading) => reading.key === "utf8")?.width).toBe(3);
    });

    /**
     * The same sixteen bytes name two different GUIDs. Big-endian is RFC 4122's
     * layout; little-endian is Microsoft's, where the first three fields are
     * byte-swapped and the last two are not.
     */
    test("reads a GUID in both of its layouts", () => {
        expect(read(SIXTEEN, "big", "guid")).toBe("00112233-4455-6677-8899-AABBCCDDEEFF");
        expect(read(SIXTEEN, "little", "guid")).toBe("33221100-5544-7766-8899-AABBCCDDEEFF");
    });

    test("leaves a reading empty when the document runs out of bytes", () => {
        const readings = readInspector(Uint8Array.from([0x41]), "little");
        const byKey = new Map(readings.map((reading) => [reading.key, reading.value]));

        expect(byKey.get("uint8")).toBe("65");
        expect(byKey.get("uint16")).toBeNull();
        expect(byKey.get("int64")).toBeNull();
        expect(byKey.get("guid")).toBeNull();
    });

    test("leaves every reading empty when there are no bytes at all", () => {
        const readings = readInspector(new Uint8Array(0), "little");

        expect(readings.every((reading) => reading.value === null)).toBe(true);
        expect(readings).toHaveLength(INSPECTOR_KEYS.length);
    });

    /** The caret is at the start of the window, whatever came before it. */
    test("reads from the start of the window it was handed", () => {
        expect(read([0x02, 0x00], "little", "uint16")).toBe("2");
    });
});

describe("decodeFloat16", () => {
    /**
     * Vectors from IEEE 754's binary16, not from a second copy of this function.
     * The accessor that would otherwise answer these — `DataView.getFloat16` —
     * is too recent to rely on across Bun, Node and every browser, which is why
     * the arithmetic is written out and why it is checked against the spec.
     */
    test("matches the published binary16 vectors", () => {
        expect(decodeFloat16(0x0000)).toBe(0);
        expect(decodeFloat16(0x8000)).toBe(-0);
        expect(decodeFloat16(0x3c00)).toBe(1);
        expect(decodeFloat16(0xbc00)).toBe(-1);
        expect(decodeFloat16(0x4000)).toBe(2);
        expect(decodeFloat16(0x3800)).toBe(0.5);
        // The largest and the smallest normal values.
        expect(decodeFloat16(0x7bff)).toBe(65504);
        expect(decodeFloat16(0x0400)).toBeCloseTo(6.103515625e-5, 12);
        // The smallest subnormal.
        expect(decodeFloat16(0x0001)).toBeCloseTo(5.960464477539063e-8, 16);
        expect(decodeFloat16(0x7c00)).toBe(Infinity);
        expect(decodeFloat16(0xfc00)).toBe(-Infinity);
        expect(Number.isNaN(decodeFloat16(0x7e00))).toBe(true);
    });

    test("is what the Float16 row shows", () => {
        expect(read([0x00, 0x3c], "little", "float16")).toBe("1");
        expect(read([0x3c, 0x00], "big", "float16")).toBe("1");
        expect(read([0x00, 0x7c], "little", "float16")).toBe("Infinity");
        expect(read([0x00, 0x7e], "little", "float16")).toBe("NaN");
    });
});
