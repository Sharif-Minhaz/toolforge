import { describe, expect, test } from "bun:test";

import { bytesToHex, hexToBytes, isHex } from "@/modules/tools/domain/hex";

describe("bytesToHex", () => {
    test("pads every byte to two digits", () => {
        expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
    });

    test("renders an empty buffer as an empty string", () => {
        expect(bytesToHex(new Uint8Array(0))).toBe("");
    });
});

describe("hexToBytes", () => {
    test("round-trips through bytesToHex", () => {
        const bytes = new Uint8Array([0, 127, 128, 255]);

        expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    });

    test("accepts upper case", () => {
        expect(hexToBytes("FF00")).toEqual(new Uint8Array([255, 0]));
    });

    test("rejects an odd number of digits", () => {
        expect(hexToBytes("abc")).toBeNull();
    });

    test("rejects a non-hex character", () => {
        expect(hexToBytes("zz")).toBeNull();
    });

    // Empty is "nothing to read", not "an empty buffer". Callers separate a
    // blank box from a bad one before they get here, so there is no reading of
    // `""` this has to invent.
    test("rejects an empty string", () => {
        expect(hexToBytes("")).toBeNull();
    });
});

describe("isHex", () => {
    test("accepts an even run of hex digits", () => {
        expect(isHex("deadbeef")).toBe(true);
        expect(isHex("DEADBEEF")).toBe(true);
    });

    test("rejects empty, odd-length, and non-hex values", () => {
        expect(isHex("")).toBe(false);
        expect(isHex("abc")).toBe(false);
        expect(isHex("dead beef")).toBe(false);
        expect(isHex("g0")).toBe(false);
    });
});
