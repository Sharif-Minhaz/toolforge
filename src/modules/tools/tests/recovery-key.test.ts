import { describe, expect, test } from "bun:test";

import {
    createRecoveryKey,
    formatRecoveryKey,
    normalizeRecoveryKey,
    RECOVERY_ALPHABET,
    RECOVERY_GROUP_SIZE,
    RECOVERY_KEY_LENGTH,
} from "@/modules/tools/domain/recovery-key";
import type { RandomBytes } from "@/modules/tools/types";

/**
 * A source that walks 0, 1, 2, … so every draw is a known index into the
 * alphabet. `randomIndex` reads four bytes big-endian, so only the last one
 * needs to move for the first 256 draws.
 */
function countingBytes(): RandomBytes {
    let next = 0;

    return (length) => {
        const bytes = new Uint8Array(length);
        bytes[length - 1] = next % 256;
        next += 1;

        return bytes;
    };
}

/** Every draw returns the same index, for the shape-only assertions. */
const zeroBytes: RandomBytes = (length) => new Uint8Array(length);

describe("createRecoveryKey", () => {
    test("draws exactly the specified length", () => {
        expect(createRecoveryKey(zeroBytes)).toHaveLength(RECOVERY_KEY_LENGTH);
    });

    test("draws only from the Crockford alphabet", () => {
        const key = createRecoveryKey(countingBytes());

        for (const character of key) {
            expect(RECOVERY_ALPHABET).toContain(character);
        }
    });

    test("never draws the four glyphs Crockford omits", () => {
        // 32 draws walks the whole alphabet twice, so a leaked glyph shows up.
        const drawn = new Set(
            Array.from({ length: 32 }, () => createRecoveryKey(countingBytes())).join(""),
        );

        for (const excluded of ["I", "L", "O", "U"]) {
            expect(drawn.has(excluded)).toBe(false);
        }
    });

    test("takes its randomness from the injected source alone", () => {
        expect(createRecoveryKey(zeroBytes)).toBe(RECOVERY_ALPHABET[0].repeat(RECOVERY_KEY_LENGTH));
    });
});

describe("formatRecoveryKey", () => {
    test("groups a canonical key into fours", () => {
        expect(formatRecoveryKey("8QXKH72D9F5C4M2P")).toBe("8QXK-H72D-9F5C-4M2P");
    });

    test("produces as many groups as the length divides into", () => {
        const groups = formatRecoveryKey(createRecoveryKey(zeroBytes)).split("-");

        expect(groups).toHaveLength(RECOVERY_KEY_LENGTH / RECOVERY_GROUP_SIZE);
    });
});

describe("normalizeRecoveryKey", () => {
    const canonical = "8QXKH72D9F5C4M2P";

    test("accepts the form it printed", () => {
        expect(normalizeRecoveryKey("8QXK-H72D-9F5C-4M2P")).toBe(canonical);
    });

    test("accepts the same key with no separators at all", () => {
        expect(normalizeRecoveryKey(canonical)).toBe(canonical);
    });

    test("is insensitive to case", () => {
        expect(normalizeRecoveryKey("8qxk-h72d-9f5c-4m2p")).toBe(canonical);
    });

    /** Spaces, tabs and newlines are what a paste out of a note actually has. */
    test("survives the whitespace a paste brings with it", () => {
        expect(normalizeRecoveryKey("  8QXK H72D\t9F5C\n4M2P  ")).toBe(canonical);
    });

    test("tolerates separators the printer never used", () => {
        expect(normalizeRecoveryKey("8QXK_H72D/9F5C.4M2P")).toBe(canonical);
    });

    /**
     * The whole reason for Crockford. Somebody reading `0` off a screen writes
     * `O`, and the key they wrote down is still their key.
     */
    test("folds O onto zero", () => {
        expect(normalizeRecoveryKey("OQXKH72D9F5C4M2P")).toBe("0QXKH72D9F5C4M2P");
    });

    test("folds I and L onto one", () => {
        expect(normalizeRecoveryKey("IQXKH72D9F5CLM2P")).toBe("1QXKH72D9F5C1M2P");
    });

    test("folds a lower-case l onto one as well", () => {
        expect(normalizeRecoveryKey("lqxkh72d9f5c4m2p")).toBe("1QXKH72D9F5C4M2P");
    });

    test("rejects a key that is one character short", () => {
        expect(normalizeRecoveryKey("8QXK-H72D-9F5C-4M2")).toBeNull();
    });

    test("rejects a key that is one character long", () => {
        expect(normalizeRecoveryKey("8QXK-H72D-9F5C-4M2PP")).toBeNull();
    });

    test("rejects the empty string", () => {
        expect(normalizeRecoveryKey("")).toBeNull();
    });

    test("rejects whitespace alone", () => {
        expect(normalizeRecoveryKey("   \t\n  ")).toBeNull();
    });

    /**
     * `U` is dropped rather than folded — Crockford excludes it to avoid words,
     * not because it is misread — so a key containing one is not a key.
     */
    test("rejects a key carrying U, which folds onto nothing", () => {
        expect(normalizeRecoveryKey("UQXKH72D9F5C4M2P")).toBeNull();
    });

    test("round-trips anything it drew and printed", () => {
        const drawn = createRecoveryKey(countingBytes());

        expect(normalizeRecoveryKey(formatRecoveryKey(drawn))).toBe(drawn);
    });
});
