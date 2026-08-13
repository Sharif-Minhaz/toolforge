import { describe, expect, test } from "bun:test";

import { countCharacters, encodeSecret, supportsPadding } from "@/modules/secret/domain/encodings";
import { SECRET_ENCODINGS } from "@/modules/secret/types";

const ascii = (text: string) => new TextEncoder().encode(text);

/** RFC 4648 §10 again, for the three encodings the shared layer already owns. */
const REFERENCE = {
    base64: { padded: "Zm9vYmE=", unpadded: "Zm9vYmE" },
    base64url: { padded: "Zm9vYmE=", unpadded: "Zm9vYmE" },
    base32: { padded: "MZXW6YTB", unpadded: "MZXW6YTB" },
    hex: { padded: "666f6f6261", unpadded: "666f6f6261" },
} as const;

describe("encodeSecret", () => {
    test("spells `fooba` the way the specification does, in every encoding", () => {
        for (const encoding of SECRET_ENCODINGS) {
            expect(encodeSecret(ascii("fooba"), encoding, true)).toBe(REFERENCE[encoding].padded);
            expect(encodeSecret(ascii("fooba"), encoding, false)).toBe(
                REFERENCE[encoding].unpadded,
            );
        }
    });

    test("differs between the two base64 alphabets only in the last two symbols", () => {
        // 0xfb 0xff exercises both `+`/`-` and `/`/`_` in one string.
        const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);

        expect(encodeSecret(bytes, "base64", false)).toBe("+/+/");
        expect(encodeSecret(bytes, "base64url", false)).toBe("-_-_");
    });

    test("ignores the padding flag for hex, which has no partial group", () => {
        const bytes = Uint8Array.from({ length: 7 }, (_, index) => index);

        expect(encodeSecret(bytes, "hex", true)).toBe(encodeSecret(bytes, "hex", false));
        expect(supportsPadding("hex")).toBe(false);
    });

    test("declares padding meaningful for every encoding that has it", () => {
        for (const encoding of SECRET_ENCODINGS) {
            const differs =
                encodeSecret(ascii("f"), encoding, true) !==
                encodeSecret(ascii("f"), encoding, false);

            expect(supportsPadding(encoding)).toBe(differs);
        }
    });
});

describe("countCharacters", () => {
    /**
     * The workbench prints this figure for encodings the reader has not
     * switched to, so it is a prediction rather than a measurement — and a
     * prediction that disagrees with the encoder is a number nobody can act on.
     */
    test("predicts the exact length the encoder produces", () => {
        for (let length = 0; length <= 70; length += 1) {
            const bytes = Uint8Array.from({ length }, (_, index) => index % 256);

            for (const encoding of SECRET_ENCODINGS) {
                for (const padded of [true, false]) {
                    expect(countCharacters(length, encoding, padded)).toBe(
                        encodeSecret(bytes, encoding, padded).length,
                    );
                }
            }
        }
    });

    test("puts the default 32 bytes at the widths the article quotes", () => {
        expect(countCharacters(32, "base64url", false)).toBe(43);
        expect(countCharacters(32, "base64", true)).toBe(44);
        expect(countCharacters(32, "hex", false)).toBe(64);
        expect(countCharacters(32, "base32", false)).toBe(52);
        expect(countCharacters(32, "base32", true)).toBe(56);
    });
});
