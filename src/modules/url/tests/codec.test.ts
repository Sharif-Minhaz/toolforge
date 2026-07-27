import { describe, expect, test } from "bun:test";

import { isCharsetSupported, textToBytes } from "@/modules/tools/domain/text-codec";
import {
    exceedsInputLimit,
    percentDecode,
    percentEncode,
    wrapPercentEncoded,
} from "@/modules/url/domain/codec";
import { MAX_URL_INPUT_BYTES, URL_LINE_WIDTH } from "@/modules/url/domain/constants";
import type { UrlEncodeProfile } from "@/modules/url/types";

const utf8 = new TextEncoder();

function encode(text: string, profile: UrlEncodeProfile, uppercaseHex = true): string {
    return percentEncode(utf8.encode(text), profile, uppercaseHex);
}

function decoded(input: string, plusAsSpace = false): string {
    const result = percentDecode(input, "utf-8", plusAsSpace);

    if (!result.ok) {
        throw new Error(`expected a decode, got ${result.reason}`);
    }

    return new TextDecoder().decode(result.bytes);
}

describe("percentEncode", () => {
    test("leaves an unreserved run untouched", () => {
        expect(encode("abcXYZ012-._~", "component")).toBe("abcXYZ012-._~");
    });

    test("escapes a space as %20 outside form data", () => {
        expect(encode("a b", "component")).toBe("a%20b");
        expect(encode("a b", "uri")).toBe("a%20b");
    });

    test("writes a space as + under the form profile", () => {
        expect(encode("a b", "form")).toBe("a+b");
    });

    test("keeps a URL's structure under the uri profile", () => {
        expect(encode("https://a.test/p?q=1&r=2#f", "uri")).toBe("https://a.test/p?q=1&r=2#f");
    });

    test("dismantles that same URL under the component profile", () => {
        expect(encode("https://a.test/p?q=1", "component")).toBe(
            "https%3A%2F%2Fa.test%2Fp%3Fq%3D1",
        );
    });

    test("escapes the percent sign itself under every profile", () => {
        expect(encode("100%", "component")).toBe("100%25");
        expect(encode("100%", "uri")).toBe("100%25");
        expect(encode("100%", "form")).toBe("100%25");
    });

    test("writes multi-byte UTF-8 one escape per byte", () => {
        expect(encode("café", "component")).toBe("caf%C3%A9");
        expect(encode("🚀", "component")).toBe("%F0%9F%9A%80");
    });

    test("honours lowercase hex when asked", () => {
        expect(encode("café", "component", false)).toBe("caf%c3%a9");
    });

    test("encodes non-UTF-8 bytes exactly as given", () => {
        // ISO-8859-1 writes é as a single 0xE9 byte, unlike UTF-8's two.
        const bytes = textToBytes("é", "iso-8859-1");

        expect(bytes.ok).toBe(true);
        expect(bytes.ok && percentEncode(bytes.bytes, "component", true)).toBe("%E9");
    });

    test("returns an empty string for no bytes", () => {
        expect(percentEncode(new Uint8Array(), "component", true)).toBe("");
    });
});

describe("percentDecode", () => {
    test("turns escapes back into their characters", () => {
        expect(decoded("a%20b")).toBe("a b");
        expect(decoded("caf%C3%A9")).toBe("café");
    });

    test("accepts lowercase hex digits", () => {
        expect(decoded("caf%c3%a9")).toBe("café");
    });

    test("leaves + alone unless form decoding was asked for", () => {
        expect(decoded("a+b")).toBe("a+b");
        expect(decoded("a+b", true)).toBe("a b");
    });

    test("carries unescaped characters through unchanged", () => {
        expect(decoded("café%20au%20lait")).toBe("café au lait");
    });

    test("keeps an astral character whole", () => {
        expect(decoded("🚀%20x")).toBe("🚀 x");
    });

    test("reports a non-hex escape at its character position", () => {
        expect(percentDecode("ab%zz", "utf-8", false)).toEqual({
            ok: false,
            reason: "invalid_escape",
            position: 3,
        });
    });

    test("counts that position in characters, not code units", () => {
        expect(percentDecode("🚀%zz", "utf-8", false)).toEqual({
            ok: false,
            reason: "invalid_escape",
            position: 2,
        });
    });

    test("reports an escape cut short at the end of the input", () => {
        expect(percentDecode("ab%", "utf-8", false)).toEqual({
            ok: false,
            reason: "truncated_escape",
            position: 3,
        });
        expect(percentDecode("%2", "utf-8", false)).toEqual({
            ok: false,
            reason: "truncated_escape",
            position: 1,
        });
    });

    test("decodes into the destination character set", () => {
        const result = percentDecode("%E9", "iso-8859-1", false);

        expect(result).toEqual({ ok: true, bytes: new Uint8Array([0xe9]) });
    });

    test("writes unescaped text through the destination set", () => {
        const result = percentDecode("é", "iso-8859-1", false);

        expect(result).toEqual({ ok: true, bytes: new Uint8Array([0xe9]) });
    });

    test("reports text the destination set cannot write, at its position", () => {
        expect(percentDecode("ab🚀", "ascii", false)).toEqual({
            ok: false,
            reason: "unencodable_character",
            position: 3,
        });
    });

    test("offsets that position past an earlier escape", () => {
        // `%`, `2` and `0` hold positions 1–3, so the rocket is the sixth.
        expect(percentDecode("%20ab🚀", "ascii", false)).toEqual({
            ok: false,
            reason: "unencodable_character",
            position: 6,
        });
    });

    test("writes an unescaped ASCII character as its own single byte", () => {
        // Not through the character set: UTF-16LE would spend two bytes on it,
        // and the encoded stream only ever held one.
        expect(percentDecode("A%00", "utf-16le", false)).toEqual({
            ok: true,
            bytes: new Uint8Array([0x41, 0x00]),
        });
    });

    test("round-trips a UTF-16 payload", () => {
        const bytes = textToBytes("Hi", "utf-16le");

        expect(bytes.ok).toBe(true);

        const encoded = bytes.ok ? percentEncode(bytes.bytes, "component", true) : "";

        expect(encoded).toBe("H%00i%00");
        expect(percentDecode(encoded, "utf-16le", false)).toEqual({
            ok: true,
            bytes: new Uint8Array([0x48, 0x00, 0x69, 0x00]),
        });
    });

    test("reports a character set the runtime does not carry", () => {
        // ASCII passes through regardless, so the probe needs a character that
        // actually has to go through the set.
        const result = percentDecode("Ж", "koi8-r", false);

        if (!isCharsetSupported("koi8-r")) {
            expect(result).toEqual({ ok: false, reason: "unsupported_charset" });

            return;
        }

        expect(result).toEqual({ ok: true, bytes: new Uint8Array([0xf6]) });
    });

    test("decodes ASCII even when the destination set is unavailable", () => {
        expect(percentDecode("x", "koi8-r", false)).toEqual({
            ok: true,
            bytes: new Uint8Array([0x78]),
        });
    });

    test("returns no bytes for an empty input", () => {
        expect(percentDecode("", "utf-8", false)).toEqual({ ok: true, bytes: new Uint8Array() });
    });

    test("round-trips every profile's output", () => {
        const original = "path/to a file?q=1&r=2 #100% café 🚀";

        expect(decoded(percentEncode(utf8.encode(original), "component", true))).toBe(original);
        expect(decoded(percentEncode(utf8.encode(original), "uri", true))).toBe(original);
        expect(decoded(percentEncode(utf8.encode(original), "form", true), true)).toBe(original);
    });
});

describe("wrapPercentEncoded", () => {
    test("leaves anything at or under the width alone", () => {
        expect(wrapPercentEncoded("abc", "lf", 3)).toBe("abc");
        expect(wrapPercentEncoded("abc", "lf")).toBe("abc");
    });

    test("splits a long run at the requested width", () => {
        expect(wrapPercentEncoded("abcdef", "lf", 2)).toBe("ab\ncd\nef");
    });

    test("uses the requested separator", () => {
        expect(wrapPercentEncoded("abcdef", "crlf", 2)).toBe("ab\r\ncd\r\nef");
    });

    test("never breaks between a % and its digits", () => {
        // The width would fall between %2 and 0, so the break moves back.
        expect(wrapPercentEncoded("ab%20cd", "lf", 4)).toBe("ab\n%20c\nd");
    });

    test("never breaks straight after a %", () => {
        expect(wrapPercentEncoded("abc%20d", "lf", 4)).toBe("abc\n%20d");
    });

    test("wraps a real payload at 76 without splitting an escape", () => {
        const encoded = percentEncode(utf8.encode("é".repeat(40)), "component", true);
        const wrapped = wrapPercentEncoded(encoded, "lf");

        for (const line of wrapped.split("\n")) {
            expect(line.length).toBeLessThanOrEqual(URL_LINE_WIDTH);
            expect(line.length % 3).toBe(0);
        }

        expect(wrapped.split("\n").join("")).toBe(encoded);
    });

    test("still advances when the width cannot hold a whole escape", () => {
        expect(wrapPercentEncoded("%20%20", "lf", 1)).toBe("%\n2\n0\n%\n2\n0");
    });
});

describe("exceedsInputLimit", () => {
    test("accepts a payload exactly at the ceiling", () => {
        expect(exceedsInputLimit(MAX_URL_INPUT_BYTES)).toBe(false);
    });

    test("rejects one byte more", () => {
        expect(exceedsInputLimit(MAX_URL_INPUT_BYTES + 1)).toBe(true);
    });

    test("accepts nothing at all", () => {
        expect(exceedsInputLimit(0)).toBe(false);
    });
});
