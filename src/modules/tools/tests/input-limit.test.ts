import { describe, expect, test } from "bun:test";

import {
    MAX_NEAR_WINDOW,
    MIN_NEAR_WINDOW,
    clampToLimit,
    measureCharacters,
    nearLimitWindow,
    readInputLimit,
} from "@/modules/tools/domain/input-limit";

describe("nearLimitWindow", () => {
    test("clamps a tiny limit up to the floor", () => {
        // 10% of 20 is 2 — too late to be a warning.
        expect(nearLimitWindow(20)).toBe(MIN_NEAR_WINDOW);
        expect(nearLimitWindow(1)).toBe(MIN_NEAR_WINDOW);
    });

    test("clamps a huge limit down to the ceiling", () => {
        expect(nearLimitWindow(250_000)).toBe(MAX_NEAR_WINDOW);
        expect(nearLimitWindow(1_048_576)).toBe(MAX_NEAR_WINDOW);
    });

    test("uses the ratio in between", () => {
        expect(nearLimitWindow(200)).toBe(20);
        expect(nearLimitWindow(2_048)).toBe(205);
    });

    test("returns zero for a limit that is not a usable ceiling", () => {
        for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(nearLimitWindow(limit)).toBe(0);
        }
    });
});

describe("readInputLimit", () => {
    test("an empty box is ok with the whole limit remaining", () => {
        expect(readInputLimit(0, 100)).toEqual({
            length: 0,
            limit: 100,
            remaining: 100,
            over: 0,
            state: "ok",
        });
    });

    test("crosses to near exactly one unit inside the window", () => {
        const limit = 200;
        const window = nearLimitWindow(limit);

        expect(readInputLimit(limit - window - 1, limit).state).toBe("ok");
        expect(readInputLimit(limit - window, limit).state).toBe("near");
    });

    test("sitting exactly on the ceiling is near, not over", () => {
        const reading = readInputLimit(60, 60);

        expect(reading.state).toBe("near");
        expect(reading.remaining).toBe(0);
        expect(reading.over).toBe(0);
    });

    test("one past the ceiling is over by one", () => {
        const reading = readInputLimit(61, 60);

        expect(reading).toEqual({ length: 61, limit: 60, remaining: 0, over: 1, state: "over" });
    });

    test("reports how far past the ceiling a paste landed", () => {
        expect(readInputLimit(1_000_000, 250_000).over).toBe(750_000);
    });

    test("floors and clamps hostile numbers rather than propagating them", () => {
        expect(readInputLimit(-5, 100)).toEqual({
            length: 0,
            limit: 100,
            remaining: 100,
            over: 0,
            state: "ok",
        });
        expect(readInputLimit(10.7, 100).length).toBe(10);
        expect(readInputLimit(10, -100)).toEqual({
            length: 10,
            limit: 0,
            remaining: 0,
            over: 10,
            state: "over",
        });
    });
});

describe("measureCharacters", () => {
    test("counts UTF-16 units, matching maxLength and Zod", () => {
        expect(measureCharacters("")).toBe(0);
        expect(measureCharacters("hello")).toBe(5);
        // One astral character, two units — the count the server will check.
        expect(measureCharacters("😀")).toBe(2);
        // Bengali is BMP: one unit per code point, combining marks included.
        expect(measureCharacters("বাংলা")).toBe(5);
    });
});

describe("clampToLimit", () => {
    test("leaves a value inside the limit alone", () => {
        expect(clampToLimit("hello", 10)).toBe("hello");
        expect(clampToLimit("hello", 5)).toBe("hello");
    });

    test("trims a value past the limit", () => {
        expect(clampToLimit("hello world", 5)).toBe("hello");
    });

    test("never leaves half a surrogate pair behind", () => {
        // "a😀" is three UTF-16 units; cutting at two would split the emoji.
        expect(clampToLimit("a😀", 2)).toBe("a");
        expect(clampToLimit("a😀", 3)).toBe("a😀");
        expect(clampToLimit("😀😀", 3)).toBe("😀");
    });

    test("a zero limit empties the value", () => {
        expect(clampToLimit("hello", 0)).toBe("");
    });
});
