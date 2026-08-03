import { describe, expect, test } from "bun:test";

import { decodePunycode, toUnicodeHostname } from "@/modules/domain-inspector/domain/punycode";

/**
 * The decoder is checked against an implementation that is not this one: the
 * WHATWG `URL` parser's IDNA ToASCII, which is ICU underneath. Encoding a name
 * with it and decoding the result back here is a round trip through two
 * independent codebases, which a table of hand-copied vectors could not be.
 */
const INTERNATIONAL_NAMES = [
    "münchen.de",
    "bücher.example",
    "mañana.example",
    "한국.example",
    "中国.example",
    "испытание.example",
    "δοκιμή.example",
    "उदाहरण.example",
    "বাংলা.example",
    "παράδειγμα.δοκιμή.example",
] as const;

describe("punycode round trip", () => {
    for (const unicode of INTERNATIONAL_NAMES) {
        test(`restores ${unicode}`, () => {
            const ascii = new URL(`http://${unicode}`).hostname;

            expect(ascii).toStartWith("xn--");
            expect(toUnicodeHostname(ascii)).toBe(unicode);
        });
    }
});

describe("decodePunycode", () => {
    test("decodes a label with a basic-code-point prefix", () => {
        expect(decodePunycode("mnchen-3ya")).toBe("münchen");
    });

    test("decodes a label with no basic code points at all", () => {
        expect(decodePunycode("fiqs8s")).toBe("中国");
    });

    test("rejects a digit outside the base-36 alphabet", () => {
        expect(decodePunycode("mnchen-3y!")).toBeNull();
    });

    test("rejects a non-ASCII basic prefix", () => {
        expect(decodePunycode("münchen-3ya")).toBeNull();
    });

    test("rejects an overflowing delta", () => {
        expect(decodePunycode("zzzzzzzzzzzzzz")).toBeNull();
    });
});

describe("toUnicodeHostname", () => {
    test("leaves a plain ASCII hostname untouched", () => {
        expect(toUnicodeHostname("example.com")).toBe("example.com");
    });

    test("converts only the encoded labels", () => {
        expect(toUnicodeHostname("www.xn--mnchen-3ya.de")).toBe("www.münchen.de");
    });

    test("keeps a label that will not decode rather than dropping it", () => {
        expect(toUnicodeHostname("xn--!!!.example.com")).toBe("xn--!!!.example.com");
    });
});
