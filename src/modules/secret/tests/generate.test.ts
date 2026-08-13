import { describe, expect, test } from "bun:test";

import {
    DEFAULT_SECRET_OPTIONS,
    MAX_SECRET_BYTES,
    MIN_SECRET_BYTES,
    SECRET_BYTE_PRESETS,
} from "@/modules/secret/domain/constants";
import {
    clampByteLength,
    describeSecret,
    drawSecretBytes,
    entropyBits,
    generateSecret,
    gradeSecret,
    isValidByteLength,
    keyUses,
} from "@/modules/secret/domain/generate";
import { SECRET_ENCODINGS, type SecretOptions } from "@/modules/secret/types";
import type { RandomBytes } from "@/modules/tools/types";

/** A source with no randomness in it, so every assertion below is exact. */
const counting: RandomBytes = (length) => Uint8Array.from({ length }, (_, index) => index % 256);

const options = (overrides: Partial<SecretOptions> = {}): SecretOptions => ({
    ...DEFAULT_SECRET_OPTIONS,
    ...overrides,
});

describe("isValidByteLength", () => {
    test("accepts the range and the presets inside it", () => {
        expect(isValidByteLength(MIN_SECRET_BYTES)).toBe(true);
        expect(isValidByteLength(MAX_SECRET_BYTES)).toBe(true);

        for (const preset of SECRET_BYTE_PRESETS) {
            expect(isValidByteLength(preset)).toBe(true);
        }
    });

    test("refuses either side of it, and anything that is not a whole count", () => {
        expect(isValidByteLength(MIN_SECRET_BYTES - 1)).toBe(false);
        expect(isValidByteLength(MAX_SECRET_BYTES + 1)).toBe(false);
        expect(isValidByteLength(32.5)).toBe(false);
        expect(isValidByteLength(Number.NaN)).toBe(false);
    });
});

describe("clampByteLength", () => {
    test("pulls a value back inside the range", () => {
        expect(clampByteLength(0)).toBe(MIN_SECRET_BYTES);
        expect(clampByteLength(9000)).toBe(MAX_SECRET_BYTES);
        expect(clampByteLength(32)).toBe(32);
    });

    test("truncates rather than rounding, and survives a non-number", () => {
        expect(clampByteLength(32.9)).toBe(32);
        expect(clampByteLength(Number.NaN)).toBe(MIN_SECRET_BYTES);
        expect(clampByteLength(Number.POSITIVE_INFINITY)).toBe(MIN_SECRET_BYTES);
    });
});

describe("drawSecretBytes", () => {
    test("asks the source for exactly the requested count", () => {
        expect(drawSecretBytes(32, counting)).toHaveLength(32);
    });

    test("returns null rather than throwing on a length outside the range", () => {
        expect(drawSecretBytes(4, counting)).toBeNull();
        expect(drawSecretBytes(MAX_SECRET_BYTES + 1, counting)).toBeNull();
    });
});

describe("entropyBits", () => {
    /**
     * The figure the whole tool rests on. Eight bits a byte, exactly, with no
     * band and no estimate — and unchanged by how the bytes are then spelled,
     * which is the one thing a reader switching encodings might expect to move.
     */
    test("is eight bits a byte", () => {
        expect(entropyBits(16)).toBe(128);
        expect(entropyBits(32)).toBe(256);
        expect(entropyBits(64)).toBe(512);
    });

    test("does not move when the encoding does", () => {
        const bits = SECRET_ENCODINGS.map((encoding) => {
            const result = generateSecret(options({ encoding }), counting);

            return result.ok ? result.entropyBits : null;
        });

        expect(new Set(bits)).toEqual(new Set([256]));
    });
});

describe("gradeSecret", () => {
    test("bands on the two thresholds, inclusive at the lower bound", () => {
        expect(gradeSecret(127)).toBe("below-recommended");
        expect(gradeSecret(128)).toBe("strong");
        expect(gradeSecret(255)).toBe("strong");
        expect(gradeSecret(256)).toBe("very-strong");
    });

    test("puts the default byte count in the top band", () => {
        expect(gradeSecret(entropyBits(DEFAULT_SECRET_OPTIONS.byteLength))).toBe("very-strong");
    });
});

describe("keyUses", () => {
    test("names only the algorithms whose key size is exactly this count", () => {
        expect(keyUses(16)).toEqual(["aes-128"]);
        expect(keyUses(24)).toEqual(["aes-192"]);
        expect(keyUses(32)).toEqual(["aes-256", "chacha20", "hmac-sha256"]);
        expect(keyUses(48)).toEqual(["hmac-sha384"]);
        expect(keyUses(64)).toEqual(["hmac-sha512"]);
    });

    test("names nothing for a size that fits nothing", () => {
        // 40 bytes is not an AES-256 key with eight to spare; it is a value AES
        // cannot take at all, and offering the nearest match would say it is.
        expect(keyUses(40)).toEqual([]);
        expect(keyUses(31)).toEqual([]);
    });
});

describe("describeSecret", () => {
    test("spells the same bytes four ways without touching the entropy", () => {
        // Not `counting`: bytes 0–31 never produce a sextet of 62 or 63, so the
        // two base64 alphabets agree on them and the spellings would only look
        // distinct. This pattern reaches both `+`/`-` and `/`/`_`.
        const bytes = Uint8Array.from({ length: 32 }, (_, index) => [0xfb, 0xff, 0xbf][index % 3]);

        const spellings = SECRET_ENCODINGS.map((encoding) => {
            const result = describeSecret(bytes, options({ encoding }));

            expect(result.ok).toBe(true);

            return result.ok ? result.secret : "";
        });

        // Four distinct strings, one value.
        expect(new Set(spellings).size).toBe(SECRET_ENCODINGS.length);
    });

    test("reports the character count the encoding actually produced", () => {
        const result = describeSecret(counting(32), options({ encoding: "base64url" }));

        expect(result.ok && result.secret).toHaveLength(43);
        expect(result.ok && result.characterCount).toBe(43);
    });

    test("normalises the padding flag away for an encoding that has none", () => {
        const padded = describeSecret(counting(32), options({ encoding: "hex", padded: true }));
        const bare = describeSecret(counting(32), options({ encoding: "hex", padded: false }));

        expect(padded.ok && padded.secret).toBe(bare.ok ? bare.secret : "");
        // And the command must not claim to strip padding that was never there.
        expect(padded.ok && padded.command).toBe("openssl rand -hex 32");
    });

    test("wraps the secret in the chosen shape", () => {
        const result = describeSecret(
            counting(32),
            options({ shape: "env", variableName: "JWT_SECRET" }),
        );

        expect(result.ok && result.formatted).toBe(result.ok ? `JWT_SECRET=${result.secret}` : "");
    });

    test("refuses a variable name a shell would not take, but only where it is used", () => {
        expect(
            describeSecret(counting(32), options({ shape: "env", variableName: "2FA" })),
        ).toEqual({ ok: false, reason: "invalid_variable_name" });

        // The same bad name is irrelevant to a bare secret, so it is not an error.
        expect(
            describeSecret(counting(32), options({ shape: "bare", variableName: "2FA" })).ok,
        ).toBe(true);
    });

    test("refuses a byte count outside the range with its own reason", () => {
        expect(describeSecret(counting(4), options())).toEqual({
            ok: false,
            reason: "invalid_length",
        });
    });
});

describe("generateSecret", () => {
    test("is deterministic given a deterministic source", () => {
        const first = generateSecret(options(), counting);
        const second = generateSecret(options(), counting);

        expect(first).toEqual(second);
    });

    test("draws a different value from the real source each time", () => {
        const drawn = new Set(
            Array.from({ length: 8 }, () => {
                const result = generateSecret(options());

                return result.ok ? result.secret : "";
            }),
        );

        expect(drawn.size).toBe(8);
        expect(drawn.has("")).toBe(false);
    });

    test("carries the byte count, the grade and the uses through", () => {
        const result = generateSecret(options({ byteLength: 64 }), counting);

        expect(result.ok).toBe(true);
        expect(result.ok && result.byteLength).toBe(64);
        expect(result.ok && result.entropyBits).toBe(512);
        expect(result.ok && result.grade).toBe("very-strong");
        expect(result.ok && result.uses).toEqual(["hmac-sha512"]);
    });

    test("refuses a length the field could not have produced", () => {
        expect(generateSecret(options({ byteLength: 0 }), counting)).toEqual({
            ok: false,
            reason: "invalid_length",
        });
    });
});
