import { describe, expect, test } from "bun:test";

import {
    pick,
    pickCharacter,
    randomIndex,
    RandomSourceError,
    shuffle,
} from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

/**
 * Hands out the given 32-bit draws in order, repeating the last one forever, and
 * counts how many were taken — which is how the rejection branch is observed.
 */
function queuedDraws(...draws: readonly number[]): {
    bytes: RandomBytes;
    calls: () => number;
} {
    let index = 0;

    return {
        bytes: () => {
            const draw = draws[Math.min(index, draws.length - 1)];
            index += 1;

            return new Uint8Array([
                (draw >>> 24) & 0xff,
                (draw >>> 16) & 0xff,
                (draw >>> 8) & 0xff,
                draw & 0xff,
            ]);
        },
        calls: () => index,
    };
}

function seededBytes(seed: number): RandomBytes {
    let state = seed >>> 0;

    return (length) => {
        const bytes = new Uint8Array(length);

        for (let index = 0; index < length; index += 1) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            bytes[index] = (state >>> 24) & 0xff;
        }

        return bytes;
    };
}

describe("randomIndex", () => {
    test("returns zero without drawing when there is only one candidate", () => {
        const source = queuedDraws(0xffffffff);

        expect(randomIndex(1, source.bytes)).toBe(0);
        expect(source.calls()).toBe(0);
    });

    test("maps a draw onto the range", () => {
        expect(randomIndex(10, queuedDraws(0).bytes)).toBe(0);
        expect(randomIndex(10, queuedDraws(7).bytes)).toBe(7);
        expect(randomIndex(10, queuedDraws(23).bytes)).toBe(3);
    });

    test("rejects the draws that would bias the low residues and redraws", () => {
        // 2³² mod 94 is 42, so the top 42 draws would give the first 42
        // characters of a 94-character pool a second chance each.
        const source = queuedDraws(0xffffffff, 5);

        expect(randomIndex(94, source.bytes)).toBe(5);
        expect(source.calls()).toBe(2);
    });

    test("never rejects when the pool size divides 2³² — the 1024-word list", () => {
        const source = queuedDraws(0xffffffff);

        expect(randomIndex(1024, source.bytes)).toBe(1023);
        expect(source.calls()).toBe(1);
    });

    test("throws rather than loop forever on a source that only returns rejects", () => {
        expect(() => randomIndex(94, queuedDraws(0xffffffff).bytes)).toThrow(RandomSourceError);
    });
});

describe("pick and pickCharacter", () => {
    test("index into the collection they were given", () => {
        expect(pick(["a", "b", "c", "d"], queuedDraws(2).bytes)).toBe("c");
        expect(pickCharacter("wxyz", queuedDraws(3).bytes)).toBe("z");
    });
});

describe("shuffle", () => {
    test("returns a permutation and leaves the input alone", () => {
        const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
        const shuffled = shuffle(input, seededBytes(11));

        expect(shuffled).toHaveLength(input.length);
        expect([...shuffled].sort((a, b) => a - b)).toEqual([...input]);
        expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test("actually moves things — a no-op shuffle would leak the guaranteed positions", () => {
        const input = Array.from({ length: 24 }, (_, index) => index);
        const shuffled = shuffle(input, seededBytes(3));

        expect(shuffled).not.toEqual(input);
    });
});
