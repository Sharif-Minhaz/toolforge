import { describe, expect, test } from "bun:test";

import { MAX_PUBLIC_EXPONENT } from "../domain/constants";
import { exponentToBytes, isPortableExponent, parsePublicExponent } from "../domain/exponent";

describe("parsePublicExponent", () => {
    test("reads the two exponents every engine implements", () => {
        expect(parsePublicExponent("3")).toBe(3);
        expect(parsePublicExponent("65537")).toBe(65_537);
    });

    test("tolerates surrounding whitespace, since a pasted value carries it", () => {
        expect(parsePublicExponent("  65537\n")).toBe(65_537);
    });

    test("refuses an even exponent, which has no inverse to pair with", () => {
        expect(parsePublicExponent("4")).toBeNull();
        expect(parsePublicExponent("65538")).toBeNull();
    });

    test("refuses anything below three", () => {
        expect(parsePublicExponent("0")).toBeNull();
        expect(parsePublicExponent("1")).toBeNull();
        expect(parsePublicExponent("2")).toBeNull();
    });

    test("refuses a value past what an engine will read", () => {
        expect(parsePublicExponent(String(MAX_PUBLIC_EXPONENT))).toBe(MAX_PUBLIC_EXPONENT);
        expect(parsePublicExponent(String(MAX_PUBLIC_EXPONENT + 2))).toBeNull();
    });

    /** `Number()` accepts every one of these; the field does not. */
    test("refuses text that is not plainly a decimal integer", () => {
        for (const raw of ["", "+65537", "-3", "0x10001", "65537.0", "6 5537", "1e5", "65_537"]) {
            expect(parsePublicExponent(raw)).toBeNull();
        }
    });
});

describe("exponentToBytes", () => {
    test("writes 65537 as the three bytes Web Crypto expects", () => {
        expect(exponentToBytes(65_537)).toEqual(new Uint8Array([0x01, 0x00, 0x01]));
    });

    test("writes 3 as a single byte", () => {
        expect(exponentToBytes(3)).toEqual(new Uint8Array([0x03]));
    });

    /**
     * A leading zero byte is legal and every engine reads through it, but it
     * lands in the exported DER — so two readers who typed 65537 would get
     * different bytes if it were ever emitted.
     */
    test("never emits a leading zero byte", () => {
        for (const value of [3, 17, 257, 65_537, MAX_PUBLIC_EXPONENT]) {
            expect(exponentToBytes(value)[0]).not.toBe(0);
        }
    });

    test("round-trips through big-endian arithmetic", () => {
        for (const value of [3, 5, 17, 257, 65_537, 16_777_473, MAX_PUBLIC_EXPONENT]) {
            const bytes = exponentToBytes(value);
            const read = bytes.reduce((total, byte) => total * 256 + byte, 0);

            expect(read).toBe(value);
        }
    });
});

describe("isPortableExponent", () => {
    test("names only the two values a browser will mint a key for", () => {
        expect(isPortableExponent(3)).toBe(true);
        expect(isPortableExponent(65_537)).toBe(true);
        expect(isPortableExponent(17)).toBe(false);
        expect(isPortableExponent(65_539)).toBe(false);
    });
});
