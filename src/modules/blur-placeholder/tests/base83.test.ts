import { describe, expect, test } from "bun:test";

import {
    BASE83_ALPHABET,
    BASE83_RADIX,
    decodeBase83,
    encodeBase83,
    findInvalidBase83Index,
} from "@/modules/blur-placeholder/domain/base83";

describe("base83 alphabet", () => {
    test("holds 83 distinct characters", () => {
        expect(BASE83_RADIX).toBe(83);
        expect(new Set(BASE83_ALPHABET).size).toBe(83);
    });

    test("contains nothing that needs escaping in JSON, HTML or a URL query", () => {
        for (const character of BASE83_ALPHABET) {
            expect('"\\<>&').not.toContain(character);
        }
    });
});

describe("encodeBase83", () => {
    test("pads on the left to the requested width", () => {
        expect(encodeBase83(0, 1)).toBe("0");
        expect(encodeBase83(0, 4)).toBe("0000");
        expect(encodeBase83(1, 2)).toBe("01");
    });

    test("counts up through the alphabet", () => {
        expect(encodeBase83(9, 1)).toBe("9");
        expect(encodeBase83(10, 1)).toBe("A");
        expect(encodeBase83(82, 1)).toBe("~");
    });

    test("carries into the next digit at the radix", () => {
        expect(encodeBase83(83, 2)).toBe("10");
        expect(encodeBase83(83 * 83 - 1, 2)).toBe("~~");
    });
});

describe("decodeBase83", () => {
    test("round-trips every single digit", () => {
        for (let value = 0; value < BASE83_RADIX; value += 1) {
            expect(decodeBase83(encodeBase83(value, 1))).toBe(value);
        }
    });

    test("round-trips the four-character range used for the average colour", () => {
        for (const value of [0, 1, 255, 65_535, 16_777_215]) {
            expect(decodeBase83(encodeBase83(value, 4))).toBe(value);
        }
    });

    test("rejects a character outside the alphabet", () => {
        expect(decodeBase83("A!")).toBeNull();
        expect(decodeBase83("(")).toBeNull();
    });

    test("reads an empty string as zero", () => {
        expect(decodeBase83("")).toBe(0);
    });
});

describe("findInvalidBase83Index", () => {
    test("returns -1 when every character is in the alphabet", () => {
        expect(findInvalidBase83Index("LEHV6nWB2yk8pyo0adR*")).toBe(-1);
    });

    test("points at the first offender", () => {
        expect(findInvalidBase83Index("LEH!V6")).toBe(3);
        expect(findInvalidBase83Index("(LEHV6")).toBe(0);
    });

    test("counts code points, not UTF-16 units", () => {
        // The emoji is one character to a person and two to `charCodeAt`.
        expect(findInvalidBase83Index("AB🙂C")).toBe(2);
    });
});
