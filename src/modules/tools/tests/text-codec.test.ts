import { describe, expect, test } from "bun:test";

import {
    CHARSETS,
    ENCODABLE_CHARSETS,
    getCharset,
    getCharsetLabel,
    isEncodable,
    type CharsetId,
} from "@/modules/tools/domain/charsets";
import { bytesToText, isCharsetSupported, textToBytes } from "@/modules/tools/domain/text-codec";

/**
 * Browsers and Node carry the whole Encoding Standard; Bun, which runs these
 * tests, ships only a handful of labels. Rather than skip the rest, each case
 * asserts the real bytes where the runtime can produce them and the documented
 * degradation where it cannot.
 */
function encoded(text: string, charset: CharsetId): Uint8Array {
    const result = textToBytes(text, charset);

    if (!result.ok) {
        throw new Error(`expected ${charset} to encode "${text}", got ${result.reason}`);
    }

    return result.bytes;
}

describe("charset registry", () => {
    test("exposes a unique id and label for every entry", () => {
        const ids = CHARSETS.map((charset) => charset.id);
        const labels = CHARSETS.map((charset) => charset.label);

        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(labels).size).toBe(labels.length);
    });

    test("offers only writable sets for encoding", () => {
        for (const charset of ENCODABLE_CHARSETS) {
            expect(charset.encoder).not.toBeNull();
            expect(isEncodable(charset.id)).toBe(true);
        }

        expect(isEncodable("shift_jis")).toBe(false);
        expect(ENCODABLE_CHARSETS.length).toBeLessThan(CHARSETS.length);
    });

    test("names every set for the UI", () => {
        expect(getCharsetLabel("utf-8")).toBe("UTF-8");
        expect(getCharset("big5").decoder).toBe("big5");
    });
});

describe("textToBytes", () => {
    test("writes UTF-8 by default", () => {
        expect(encoded("é", "utf-8")).toEqual(new Uint8Array([0xc3, 0xa9]));
    });

    test("writes a single byte per character for Latin-1", () => {
        expect(encoded("é", "iso-8859-1")).toEqual(new Uint8Array([0xe9]));
    });

    test("has no byte for a character outside the set", () => {
        // The euro sign exists in Windows-1252 but not in Latin-1.
        expect(encoded("€", "windows-1252")).toEqual(new Uint8Array([0x80]));
        expect(textToBytes("€", "iso-8859-1")).toEqual({
            ok: false,
            reason: "unencodable_character",
            position: 1,
        });
    });

    for (const [charset, character, byte] of [
        ["iso-8859-15", "€", 0xa4],
        ["iso-8859-2", "ř", 0xf8],
        ["koi8-r", "Ж", 0xf6],
        ["windows-1251", "Ж", 0xc6],
        ["ibm866", "Ж", 0x86],
    ] as const) {
        test(`inverts the ${charset} table to write "${character}"`, () => {
            const result = textToBytes(character, charset);

            if (!isCharsetSupported(charset)) {
                expect(result).toEqual({ ok: false, reason: "unsupported_charset" });

                return;
            }

            expect(result).toEqual({ ok: true, bytes: new Uint8Array([byte]) });
        });
    }

    test("holds ASCII to the 7-bit range", () => {
        expect(encoded("ok", "ascii")).toEqual(new Uint8Array([0x6f, 0x6b]));
        expect(textToBytes("café", "ascii")).toEqual({
            ok: false,
            reason: "unencodable_character",
            position: 4,
        });
    });

    test("counts the position in characters, not code units", () => {
        // The emoji is one character but two code units; the failure lands on
        // the character after it.
        expect(textToBytes("🚀é", "ascii")).toMatchObject({ position: 1 });
        expect(textToBytes("aé", "ascii")).toMatchObject({ position: 2 });
    });

    test("writes UTF-16 in both byte orders", () => {
        expect(encoded("ab", "utf-16le")).toEqual(new Uint8Array([0x61, 0x00, 0x62, 0x00]));
        expect(encoded("ab", "utf-16be")).toEqual(new Uint8Array([0x00, 0x61, 0x00, 0x62]));
    });

    test("refuses a decode-only set", () => {
        expect(textToBytes("あ", "shift_jis")).toEqual({
            ok: false,
            reason: "unencodable_character",
        });
    });

    test("round-trips every writable set this runtime provides", () => {
        for (const charset of ENCODABLE_CHARSETS) {
            if (!isCharsetSupported(charset.id)) {
                continue;
            }

            const sample = "Base64 tool 42";

            expect(bytesToText(encoded(sample, charset.id), charset.id)).toEqual({
                ok: true,
                text: sample,
            });
        }
    });

    test("reports a set this runtime lacks instead of throwing", () => {
        for (const charset of CHARSETS) {
            if (isCharsetSupported(charset.id)) {
                continue;
            }

            expect(bytesToText(new Uint8Array([0x41]), charset.id)).toEqual({
                ok: false,
                reason: "unsupported_charset",
            });
        }
    });
});

describe("bytesToText", () => {
    test("reads UTF-16 in both byte orders", () => {
        // "あ" is 0x30 0x42 big-endian.
        expect(bytesToText(new Uint8Array([0x30, 0x42]), "utf-16be")).toEqual({
            ok: true,
            text: "あ",
        });
        expect(bytesToText(new Uint8Array([0x42, 0x30]), "utf-16le")).toEqual({
            ok: true,
            text: "あ",
        });
    });

    test("reads a multi-byte legacy set", () => {
        // "あ" is 0x82 0xA0 in Shift_JIS.
        const result = bytesToText(new Uint8Array([0x82, 0xa0]), "shift_jis");

        expect(result).toEqual(
            isCharsetSupported("shift_jis")
                ? { ok: true, text: "あ" }
                : { ok: false, reason: "unsupported_charset" },
        );
    });

    test("keeps Latin-1 away from the Windows-1252 substitutions", () => {
        expect(bytesToText(new Uint8Array([0x80]), "iso-8859-1")).toEqual({
            ok: true,
            text: "",
        });
        expect(bytesToText(new Uint8Array([0x80]), "windows-1252")).toEqual({
            ok: true,
            text: "€",
        });
    });

    test("rejects bytes above the 7-bit range for ASCII", () => {
        expect(bytesToText(new Uint8Array([0x80]), "ascii")).toEqual({
            ok: false,
            reason: "undecodable_text",
        });
    });

    test("reports bytes that are not text in the chosen set", () => {
        expect(bytesToText(new Uint8Array([0xff]), "utf-8")).toEqual({
            ok: false,
            reason: "undecodable_text",
        });
    });
});
