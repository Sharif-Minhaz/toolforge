import { describe, expect, test } from "bun:test";

import {
    buildDataUri,
    decodeToBytes,
    decodeToText,
    encodeBytes,
    encodeText,
    exceedsInputLimit,
    stripDataUriPrefix,
} from "@/modules/base64/domain/codec";
import { MAX_BASE64_INPUT_BYTES } from "@/modules/base64/domain/constants";
import { bytesToText, textToBytes } from "@/modules/tools/domain/text-codec";
import type { Base64EncodeOptions } from "@/modules/base64/types";

const PADDED: Base64EncodeOptions = { alphabet: "standard", padded: true };
const UNPADDED: Base64EncodeOptions = { alphabet: "standard", padded: false };
const URL_SAFE: Base64EncodeOptions = { alphabet: "urlSafe", padded: true };

/** The three-byte value whose sextets exercise both alphabet tails. */
const ALPHABET_TAIL = new Uint8Array([0xff, 0xef, 0xbf]);

function utf8Bytes(text: string): Uint8Array {
    const encoded = textToBytes(text, "utf-8");

    if (!encoded.ok) {
        throw new Error("UTF-8 can encode any string");
    }

    return encoded.bytes;
}

function decodedBytes(input: string): Uint8Array {
    const result = decodeToBytes(input);

    if (!result.ok) {
        throw new Error(`expected a successful decode, got ${result.reason}`);
    }

    return result.bytes;
}

describe("encodeText", () => {
    for (const [input, expected] of [
        ["", ""],
        ["f", "Zg=="],
        ["fo", "Zm8="],
        ["foo", "Zm9v"],
        ["foob", "Zm9vYg=="],
        ["fooba", "Zm9vYmE="],
        ["foobar", "Zm9vYmFy"],
    ] as const) {
        test(`matches the RFC 4648 vector for "${input}"`, () => {
            expect(encodeText(input, PADDED)).toBe(expected);
        });
    }

    for (const [input, expected] of [
        ["f", "Zg"],
        ["fo", "Zm8"],
        ["foo", "Zm9v"],
        ["fooba", "Zm9vYmE"],
    ] as const) {
        test(`drops padding for "${input}" when asked to`, () => {
            expect(encodeText(input, UNPADDED)).toBe(expected);
        });
    }

    test("encodes multi-byte characters as their UTF-8 bytes", () => {
        expect(encodeText("é", PADDED)).toBe("w6k=");
        expect(encodeText("বাংলা", PADDED)).toBe(encodeBytes(utf8Bytes("বাংলা"), PADDED));
    });

    test("round-trips text outside the Latin-1 range", () => {
        for (const sample of ["বাংলা লেখা", "🚀 ship it", "line\nbreak\ttab"]) {
            expect(decodeToText(encodeText(sample, PADDED))).toEqual({ ok: true, text: sample });
        }
    });
});

describe("encodeBytes", () => {
    test("emits an empty string for an empty buffer", () => {
        expect(encodeBytes(new Uint8Array(), PADDED)).toBe("");
    });

    test("uses + and / for the standard alphabet", () => {
        expect(encodeBytes(ALPHABET_TAIL, PADDED)).toBe("/++/");
    });

    test("uses - and _ for the URL-safe alphabet", () => {
        expect(encodeBytes(ALPHABET_TAIL, URL_SAFE)).toBe("_--_");
    });
});

describe("decodeToBytes", () => {
    test("reads both alphabets without being told which one", () => {
        expect(decodedBytes("/++/")).toEqual(ALPHABET_TAIL);
        expect(decodedBytes("_--_")).toEqual(ALPHABET_TAIL);
    });

    test("accepts input with the padding left off", () => {
        expect(decodeToText("Zg")).toEqual({ ok: true, text: "f" });
        expect(decodeToText("Zm9vYmE")).toEqual({ ok: true, text: "fooba" });
    });

    test("ignores whitespace anywhere in the payload", () => {
        expect(decodeToText("  Zm9v\n\tYmFy  ")).toEqual({ ok: true, text: "foobar" });
    });

    test("decodes an empty payload to an empty buffer", () => {
        expect(decodedBytes("")).toEqual(new Uint8Array());
    });

    test("strips a data URI header before decoding", () => {
        expect(decodeToText("data:text/plain;base64,Zm9vYmFy")).toEqual({
            ok: true,
            text: "foobar",
        });
    });

    test("reports the position of the first character outside the alphabet", () => {
        expect(decodeToBytes("Zm9v!")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 5,
        });
    });

    test("counts the data URI header when reporting a position", () => {
        expect(decodeToBytes("data:text/plain;base64,Zm9v!")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 28,
        });
    });

    test("rejects payload characters that follow the padding", () => {
        expect(decodeToBytes("Zg==Zg==")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 5,
        });
    });

    for (const input of ["Zm9vY", "Zg=", "Zm9vYmFyZ"]) {
        test(`rejects "${input}" as an impossible length`, () => {
            expect(decodeToBytes(input)).toEqual({ ok: false, reason: "invalid_length" });
        });
    }

    test("rejects more than two padding characters", () => {
        expect(decodeToBytes("Zg===")).toEqual({ ok: false, reason: "invalid_length" });
    });

    test("refuses a payload larger than the input ceiling", () => {
        const oversized = "A".repeat(Math.ceil(((MAX_BASE64_INPUT_BYTES + 1) * 8) / 6) + 4);

        expect(decodeToBytes(oversized)).toEqual({ ok: false, reason: "too_large" });
    });
});

describe("bytesToText", () => {
    test("reports bytes that are not valid UTF-8", () => {
        expect(bytesToText(new Uint8Array([0xff]), "utf-8")).toEqual({
            ok: false,
            reason: "undecodable_text",
        });
        expect(decodeToText("/w==")).toEqual({ ok: false, reason: "undecodable_text" });
    });

    test("decodes a valid UTF-8 sequence", () => {
        expect(bytesToText(utf8Bytes("ok"), "utf-8")).toEqual({ ok: true, text: "ok" });
    });
});

describe("stripDataUriPrefix", () => {
    test("returns the payload untouched when there is no header", () => {
        expect(stripDataUriPrefix("Zm9v")).toEqual({ payload: "Zm9v", offset: 0 });
    });

    test("pulls the media type out of the header", () => {
        expect(stripDataUriPrefix("data:image/png;base64,iVBOR")).toEqual({
            payload: "iVBOR",
            mimeType: "image/png",
            offset: 22,
        });
    });

    test("keeps parameters out of the media type", () => {
        expect(stripDataUriPrefix("data:text/plain;charset=utf-8;base64,Zm9v").mimeType).toBe(
            "text/plain",
        );
    });

    test("falls back to a generic media type when the header omits one", () => {
        expect(stripDataUriPrefix("data:;base64,Zm9v").mimeType).toBe("application/octet-stream");
    });
});

describe("buildDataUri", () => {
    test("wraps a payload in a data URI header", () => {
        expect(buildDataUri("Zm9v", "text/plain")).toBe("data:text/plain;base64,Zm9v");
    });
});

describe("exceedsInputLimit", () => {
    test("allows exactly the ceiling and rejects one byte more", () => {
        expect(exceedsInputLimit(MAX_BASE64_INPUT_BYTES)).toBe(false);
        expect(exceedsInputLimit(MAX_BASE64_INPUT_BYTES + 1)).toBe(true);
    });
});
