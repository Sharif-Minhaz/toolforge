import { describe, expect, test } from "bun:test";
import jsQR from "jsqr";

import { encodeQr, isDark, selectMode } from "@/modules/qr/domain/encoder";
import {
    getAlignmentPositions,
    getDataCodewords,
    getModuleCount,
    getTotalCodewords,
    QR_MAX_VERSION,
    type QrMode,
} from "@/modules/qr/domain/qr-tables";
import { computeDivisor, computeRemainder, multiply } from "@/modules/qr/domain/reed-solomon";
import { QR_ERROR_LEVELS, type QrErrorLevel, type QrMatrix } from "@/modules/qr/types";

/**
 * Every generated symbol is read back with jsQR, an independent decoder. That
 * is the only check that means anything here: a table typo or an off-by-one in
 * the interleaver still produces a plausible-looking grid, and only a decoder
 * notices that it says nothing.
 */

const MODULE_PIXELS = 4;
const QUIET_ZONE = 4;

/** Paints the matrix into an RGBA buffer of the shape jsQR expects. */
function rasterize(matrix: QrMatrix): { data: Uint8ClampedArray; width: number } {
    const side = (matrix.size + QUIET_ZONE * 2) * MODULE_PIXELS;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);

    for (let y = 0; y < matrix.size; y += 1) {
        for (let x = 0; x < matrix.size; x += 1) {
            if (!isDark(matrix, x, y)) {
                continue;
            }

            for (let dy = 0; dy < MODULE_PIXELS; dy += 1) {
                for (let dx = 0; dx < MODULE_PIXELS; dx += 1) {
                    const pixelX = (x + QUIET_ZONE) * MODULE_PIXELS + dx;
                    const pixelY = (y + QUIET_ZONE) * MODULE_PIXELS + dy;
                    const offset = (pixelY * side + pixelX) * 4;

                    data[offset] = 0;
                    data[offset + 1] = 0;
                    data[offset + 2] = 0;
                }
            }
        }
    }

    return { data, width: side };
}

function decode(matrix: QrMatrix): string | null {
    const { data, width } = rasterize(matrix);

    return jsQR(data, width, width)?.data ?? null;
}

function encodeOrThrow(text: string, level: QrErrorLevel): QrMatrix {
    const result = encodeQr(text, level);

    if (!result.ok) {
        throw new Error(`encodeQr rejected ${text.length} characters: ${result.reason}`);
    }

    return result.matrix;
}

describe("selectMode", () => {
    const cases: readonly { readonly text: string; readonly mode: QrMode }[] = [
        { text: "0123456789", mode: "numeric" },
        { text: "7", mode: "numeric" },
        { text: "HELLO WORLD", mode: "alphanumeric" },
        { text: "HTTPS://EXAMPLE.COM/A", mode: "alphanumeric" },
        { text: "hello world", mode: "byte" },
        { text: "HELLO_WORLD", mode: "byte" },
        { text: "কিউআর", mode: "byte" },
        { text: "12.5", mode: "alphanumeric" },
    ];

    for (const { text, mode } of cases) {
        test(`picks ${mode} for ${JSON.stringify(text)}`, () => {
            expect(selectMode(text)).toBe(mode);
        });
    }
});

describe("encodeQr — boundaries", () => {
    test("rejects an empty payload", () => {
        expect(encodeQr("", "M")).toEqual({ ok: false, reason: "empty" });
    });

    test("rejects a payload no version can hold", () => {
        // Version 40 at level H carries 1,273 data codewords, so byte mode tops
        // out well below this.
        expect(encodeQr("a".repeat(5_000), "H")).toEqual({ ok: false, reason: "too_long" });
    });

    test("uses the smallest version that fits", () => {
        expect(encodeOrThrow("HELLO", "M").version).toBe(1);
        expect(encodeOrThrow("a".repeat(200), "M").version).toBeGreaterThan(6);
    });

    test("a higher level needs at least as large a symbol", () => {
        const payload = "https://toolforge.example/tools/qr?mode=generate";
        let previous = 0;

        for (const level of QR_ERROR_LEVELS) {
            const { version } = encodeOrThrow(payload, level);

            expect(version).toBeGreaterThanOrEqual(previous);
            previous = version;
        }
    });

    test("the matrix is square and the right size for its version", () => {
        const matrix = encodeOrThrow("https://example.com", "Q");

        expect(matrix.size).toBe(getModuleCount(matrix.version));
        expect(matrix.modules.length).toBe(matrix.size * matrix.size);
        expect(matrix.mask).toBeGreaterThanOrEqual(0);
        expect(matrix.mask).toBeLessThan(8);
    });
});

describe("encodeQr — function patterns", () => {
    const matrix = encodeOrThrow("https://example.com/function-patterns", "M");

    test("all three finder patterns are drawn", () => {
        const corners = [
            [0, 0],
            [matrix.size - 7, 0],
            [0, matrix.size - 7],
        ] as const;

        for (const [originX, originY] of corners) {
            for (let dy = 0; dy < 7; dy += 1) {
                for (let dx = 0; dx < 7; dx += 1) {
                    const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));

                    expect(isDark(matrix, originX + dx, originY + dy)).toBe(ring !== 2);
                }
            }
        }
    });

    test("the timing patterns alternate", () => {
        for (let index = 8; index < matrix.size - 8; index += 1) {
            expect(isDark(matrix, 6, index)).toBe(index % 2 === 0);
            expect(isDark(matrix, index, 6)).toBe(index % 2 === 0);
        }
    });

    test("the dark module is always dark", () => {
        expect(isDark(matrix, 8, matrix.size - 8)).toBe(true);
    });

    test("out-of-bounds coordinates read as light", () => {
        expect(isDark(matrix, -1, 0)).toBe(false);
        expect(isDark(matrix, 0, matrix.size)).toBe(false);
    });
});

describe("encodeQr — round trip through jsQR", () => {
    const payloads: readonly { readonly name: string; readonly text: string }[] = [
        { name: "a short URL", text: "https://example.com" },
        { name: "numeric mode", text: "8675309".repeat(12) },
        { name: "alphanumeric mode", text: "HTTPS://EXAMPLE.COM/QR-CODE $%*+-./:" },
        { name: "byte mode with punctuation", text: "https://example.com/a?b=c&d=e#f" },
        { name: "a Wi-Fi payload", text: String.raw`WIFI:T:WPA;S:My Network;P:p\;ss;H:true;;` },
        { name: "UTF-8 outside ASCII", text: "কিউআর কোড জেনারেটর — ToolForge" },
        { name: "an emoji", text: "scan me 🎯" },
        { name: "a single character", text: "A" },
    ];

    for (const { name, text } of payloads) {
        for (const level of QR_ERROR_LEVELS) {
            test(`${name} survives level ${level}`, () => {
                expect(decode(encodeOrThrow(text, level))).toBe(text);
            });
        }
    }
});

describe("encodeQr — round trip across every version", () => {
    /**
     * One payload sized to land on each version in turn, so every row of the
     * block tables and every alignment-pattern layout is actually exercised.
     * Levels are rotated rather than crossed, which keeps the run under a
     * second while still touching all four.
     */
    for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
        const level = QR_ERROR_LEVELS[version % QR_ERROR_LEVELS.length];

        test(`version ${version} at level ${level}`, () => {
            // Mode indicator plus the character count is twelve bits below
            // version 10 and twenty above it, so the payload is trimmed by two
            // codewords or three to fill the version without spilling into the
            // next one.
            const header = version >= 10 ? 3 : 2;
            const text = "x".repeat(getDataCodewords(version, level) - header);
            const matrix = encodeOrThrow(text, level);

            expect(matrix.version).toBe(version);
            expect(decode(matrix)).toBe(text);
        });
    }
});

describe("qr tables", () => {
    test("data and error-correction codewords account for the whole symbol", () => {
        for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
            for (const level of QR_ERROR_LEVELS) {
                expect(getDataCodewords(version, level)).toBeGreaterThan(0);
                expect(getDataCodewords(version, level)).toBeLessThan(getTotalCodewords(version));
            }
        }
    });

    test("capacity grows with the version and shrinks with the level", () => {
        for (let version = 2; version <= QR_MAX_VERSION; version += 1) {
            expect(getDataCodewords(version, "L")).toBeGreaterThan(
                getDataCodewords(version - 1, "L"),
            );
        }

        for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
            expect(getDataCodewords(version, "L")).toBeGreaterThan(getDataCodewords(version, "M"));
            expect(getDataCodewords(version, "M")).toBeGreaterThan(getDataCodewords(version, "Q"));
            expect(getDataCodewords(version, "Q")).toBeGreaterThan(getDataCodewords(version, "H"));
        }
    });

    test("alignment positions start at 6 and end seven modules from the edge", () => {
        expect(getAlignmentPositions(1)).toEqual([]);

        for (let version = 2; version <= QR_MAX_VERSION; version += 1) {
            const positions = getAlignmentPositions(version);

            expect(positions[0]).toBe(6);
            expect(positions.at(-1)).toBe(getModuleCount(version) - 7);
            expect(positions.length).toBe(Math.floor(version / 7) + 2);

            // Never so close together that two patterns would overlap.
            for (let index = 1; index < positions.length; index += 1) {
                expect(positions[index] - positions[index - 1]).toBeGreaterThanOrEqual(5);
            }
        }
    });
});

describe("reed-solomon", () => {
    test("multiplication in GF(256) is commutative and has an identity", () => {
        for (let a = 0; a < 256; a += 17) {
            expect(multiply(a, 1)).toBe(a);
            expect(multiply(a, 0)).toBe(0);

            for (let b = 0; b < 256; b += 23) {
                expect(multiply(a, b)).toBe(multiply(b, a));
                expect(multiply(a, b)).toBeLessThan(256);
            }
        }
    });

    test("the divisor of degree n has n coefficients", () => {
        for (const degree of [7, 10, 13, 17, 30]) {
            expect(computeDivisor(degree).length).toBe(degree);
        }
    });

    test("the remainder is as long as the divisor and depends on the data", () => {
        const divisor = computeDivisor(10);
        const first = computeRemainder(new Uint8Array([1, 2, 3, 4]), divisor);
        const second = computeRemainder(new Uint8Array([1, 2, 3, 5]), divisor);

        expect(first.length).toBe(10);
        expect(second.length).toBe(10);
        expect([...first]).not.toEqual([...second]);
    });

    test("a codeword block plus its remainder divides cleanly", () => {
        const divisor = computeDivisor(10);
        const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236]);
        const remainder = computeRemainder(data, divisor);
        const combined = new Uint8Array([...data, ...remainder]);

        expect([...computeRemainder(combined, divisor)]).toEqual(Array<number>(10).fill(0));
    });
});
