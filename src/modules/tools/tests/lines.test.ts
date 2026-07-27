import { describe, expect, test } from "bun:test";

import {
    applyNewlines,
    joinLines,
    MIME_LINE_WIDTH,
    splitLines,
    wrapLines,
} from "@/modules/tools/domain/lines";

describe("splitLines", () => {
    test("splits on any of the three line endings", () => {
        expect(splitLines("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
    });

    test("keeps blank lines as empty entries", () => {
        expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
    });

    test("returns a single entry for text with no breaks", () => {
        expect(splitLines("abc")).toEqual(["abc"]);
    });
});

describe("applyNewlines", () => {
    for (const [separator, expected] of [
        ["lf", "a\nb\nc"],
        ["crlf", "a\r\nb\r\nc"],
        ["cr", "a\rb\rc"],
    ] as const) {
        test(`rewrites mixed endings to ${separator}`, () => {
            expect(applyNewlines("a\r\nb\rc", separator)).toBe(expected);
        });
    }

    test("leaves text without line breaks alone", () => {
        expect(applyNewlines("abc", "crlf")).toBe("abc");
    });
});

describe("joinLines", () => {
    test("joins with the requested separator", () => {
        expect(joinLines(["a", "b"], "crlf")).toBe("a\r\nb");
    });

    test("returns an empty string for no lines", () => {
        expect(joinLines([], "lf")).toBe("");
    });
});

describe("wrapLines", () => {
    test("leaves anything at or under the width untouched", () => {
        expect(wrapLines("a".repeat(MIME_LINE_WIDTH), "lf")).toBe("a".repeat(MIME_LINE_WIDTH));
    });

    test("breaks a long run into fixed-width lines", () => {
        const wrapped = wrapLines("a".repeat(MIME_LINE_WIDTH + 4), "lf");

        expect(wrapped).toBe(`${"a".repeat(MIME_LINE_WIDTH)}\naaaa`);
    });

    test("uses the requested separator", () => {
        expect(wrapLines("abcdef", "crlf", 2)).toBe("ab\r\ncd\r\nef");
    });

    test("guards against a zero or negative width", () => {
        expect(wrapLines("abc", "lf", 0)).toBe("abc");
    });
});
