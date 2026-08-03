import { describe, expect, test } from "bun:test";

import {
    averageColorHex,
    decodeBlurhash,
    encodeBlurhash,
    parseBlurhash,
} from "@/modules/blur-placeholder/domain/blurhash";
import { MAX_HASH_LENGTH } from "@/modules/blur-placeholder/domain/constants";
import { gradientImage, solidImage } from "./images";

/**
 * What `blurhash-reference.test.ts` cannot cover: the typed failures, which the
 * reference raises as exceptions with English messages, and punch, whose
 * reference implementation is broken. Everything about the numbers themselves
 * is checked over there, against something that is not this repository.
 */

describe("encodeBlurhash", () => {
    test("writes the size flag as the first character", () => {
        const image = gradientImage(16, 16);

        for (const [x, y, flag] of [
            [1, 1, "0"],
            [2, 1, "1"],
            [1, 2, "9"],
            [4, 3, "L"],
            [9, 9, "|"],
        ] as const) {
            const result = encodeBlurhash(image, x, y);

            expect(result.ok).toBe(true);

            if (result.ok) {
                expect(result.hash[0]).toBe(flag);
            }
        }
    });

    test("writes four characters per component pair plus a four-character head", () => {
        const image = gradientImage(16, 16);

        for (const [x, y] of [
            [1, 1],
            [4, 3],
            [9, 9],
        ] as const) {
            const result = encodeBlurhash(image, x, y);

            expect(result.ok).toBe(true);

            if (result.ok) {
                expect(result.hash).toHaveLength(4 + 2 * x * y);
            }
        }
    });

    test("never exceeds the length the hash field is sized for", () => {
        const result = encodeBlurhash(gradientImage(16, 16), 9, 9);

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.hash.length).toBe(MAX_HASH_LENGTH);
        }
    });

    test("rejects a component count outside 1–9", () => {
        const image = gradientImage(8, 8);

        for (const [x, y] of [
            [0, 4],
            [4, 0],
            [10, 4],
            [4, 10],
            [-1, 4],
            [1.5, 4],
            [Number.NaN, 4],
        ] as const) {
            expect(encodeBlurhash(image, x, y)).toEqual({
                ok: false,
                reason: "invalid_components",
            });
        }
    });

    test("rejects pixels that do not match the declared size", () => {
        expect(
            encodeBlurhash({ data: new Uint8ClampedArray(16), width: 4, height: 4 }, 4, 3),
        ).toEqual({ ok: false, reason: "invalid_image" });

        expect(
            encodeBlurhash({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 4, 3),
        ).toEqual({ ok: false, reason: "invalid_image" });
    });

    test("is unchanged by the alpha channel, which the format cannot carry", () => {
        const opaque = gradientImage(24, 18);
        const translucent = {
            ...opaque,
            data: opaque.data.map((value, index) => (index % 4 === 3 ? 40 : value)),
        };

        expect(encodeBlurhash(translucent, 4, 3)).toEqual(encodeBlurhash(opaque, 4, 3));
    });
});

describe("parseBlurhash", () => {
    test("reads the components back out of a hash it wrote", () => {
        const result = encodeBlurhash(gradientImage(16, 16), 6, 5);

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(parseBlurhash(result.hash)).toEqual({
                ok: true,
                componentX: 6,
                componentY: 5,
                length: 4 + 2 * 30,
            });
        }
    });

    test("names an empty string as empty rather than as too short", () => {
        expect(parseBlurhash("")).toEqual({ ok: false, reason: "empty_hash" });
    });

    test("reports a stray character before complaining about the length", () => {
        // A hash pasted with its surrounding quote is a different mistake from a
        // truncated one, and the reader fixes each differently.
        expect(parseBlurhash('"LEHV6nWB2yk8pyo0adR*.7kCMdnj"')).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 1,
        });
    });

    test("counts the offending position in characters", () => {
        expect(parseBlurhash("LEH🙂V6nWB")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 4,
        });
    });

    test("rejects anything shorter than the average colour it must contain", () => {
        expect(parseBlurhash("LEHV6")).toEqual({ ok: false, reason: "too_short" });
    });

    test("says how long the size flag promised the hash would be", () => {
        expect(parseBlurhash("LEHV6nWB2yk8pyo0adR")).toEqual({
            ok: false,
            reason: "length_mismatch",
            expectedLength: 28,
        });
    });

    test("accepts the ten-row shape no encoder writes but the flag allows", () => {
        // Size flag `~` is 82, which reads as 2 × 10 — beyond what this encoder
        // can produce and still perfectly decodable, so it is not turned away.
        const hash = `~0${"0".repeat(2)}${"0".repeat(40)}`;

        expect(parseBlurhash(hash)).toEqual({
            ok: true,
            componentX: 2,
            componentY: 10,
            length: 44,
        });
    });
});

describe("decodeBlurhash", () => {
    const hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

    test("paints the size asked for, whatever the hash was made from", () => {
        for (const [width, height] of [
            [1, 1],
            [32, 32],
            [64, 9],
        ] as const) {
            const result = decodeBlurhash(hash, width, height);

            expect(result.ok).toBe(true);

            if (result.ok) {
                expect(result.pixels).toHaveLength(width * height * 4);
                expect(result.width).toBe(width);
                expect(result.height).toBe(height);
            }
        }
    });

    test("writes an opaque placeholder", () => {
        const result = decodeBlurhash(hash, 8, 8);

        expect(result.ok).toBe(true);

        if (result.ok) {
            for (let index = 3; index < result.pixels.length; index += 4) {
                expect(result.pixels[index]).toBe(255);
            }
        }
    });

    test("carries the parse failure through rather than inventing one", () => {
        expect(decodeBlurhash("nope!", 8, 8)).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 5,
        });
    });

    test("rejects a size that is not a whole number of pixels", () => {
        for (const [width, height] of [
            [0, 8],
            [8, 0],
            [-4, 8],
            [8.5, 8],
        ] as const) {
            expect(decodeBlurhash(hash, width, height)).toEqual({
                ok: false,
                reason: "invalid_size",
            });
        }
    });

    test("takes punch as the fraction it is, not as an integer", () => {
        // `blurhash@2` writes `punch = punch | 1` here, so 0.5, 1 and 2.5 all
        // collapse onto two values. Three distinct pictures is the assertion
        // that this does not.
        const rendered = [0.5, 1, 2.5].map((punch) => {
            const result = decodeBlurhash(hash, 8, 8, punch);

            return result.ok ? [...result.pixels].join(",") : "";
        });

        expect(new Set(rendered).size).toBe(3);
    });

    test("spreads the colours further apart as punch rises", () => {
        const spread = (punch: number) => {
            const result = decodeBlurhash(hash, 16, 16, punch);

            if (!result.ok) {
                return 0;
            }

            const reds = [...result.pixels].filter((_, index) => index % 4 === 0);

            return Math.max(...reds) - Math.min(...reds);
        };

        expect(spread(2)).toBeGreaterThan(spread(1));
        expect(spread(1)).toBeGreaterThan(spread(0.5));
    });

    test("collapses to a single flat colour at punch zero", () => {
        // Punch scales every coefficient but the average, so zero leaves the
        // average and nothing else. Worth pinning: it is the only input for
        // which the whole basis drops out, and a sign error in `decodeAc` would
        // survive every other assertion here.
        const encoded = encodeBlurhash(gradientImage(16, 16), 4, 3);

        expect(encoded.ok).toBe(true);

        if (!encoded.ok) {
            return;
        }

        const result = decodeBlurhash(encoded.hash, 8, 8, 0);

        expect(result.ok).toBe(true);

        if (result.ok) {
            const first = [...result.pixels.slice(0, 3)];

            for (let index = 0; index < result.pixels.length; index += 4) {
                expect([...result.pixels.slice(index, index + 3)]).toEqual(first);
            }
        }
    });
});

describe("averageColorHex", () => {
    test("reads the average colour straight out of the hash", () => {
        const encoded = encodeBlurhash(solidImage(16, 16, [0, 0, 0]), 3, 3);

        expect(encoded.ok).toBe(true);

        if (encoded.ok) {
            expect(averageColorHex(encoded.hash)).toBe("#000000");
        }
    });

    test("is the colour the decoder paints once the coefficients are silenced", () => {
        // Punch zero leaves only the average, which is exactly what this reads.
        const encoded = encodeBlurhash(solidImage(16, 16, [200, 40, 90]), 2, 2);

        expect(encoded.ok).toBe(true);

        if (!encoded.ok) {
            return;
        }

        const decoded = decodeBlurhash(encoded.hash, 4, 4, 0);
        const hex = averageColorHex(encoded.hash);

        expect(hex).toBe("#c8285a");
        expect(decoded.ok).toBe(true);

        if (decoded.ok && hex !== null) {
            const channels = [1, 3, 5].map((offset) =>
                Number.parseInt(hex.slice(offset, offset + 2), 16),
            );

            expect([...decoded.pixels.slice(0, 3)]).toEqual(channels);
        }
    });

    test("is null for anything that is not a hash", () => {
        expect(averageColorHex("")).toBeNull();
        expect(averageColorHex("LEHV6")).toBeNull();
    });
});
