import { describe, expect, test } from "bun:test";

import { compilePattern, toCompiledSource } from "@/modules/regex/domain/compile";
import { toEngineFlags } from "@/modules/regex/domain/flags";
import { parsePattern } from "@/modules/regex/domain/parse";

function rewrite(
    pattern: string,
    options: { extended?: boolean; ungreedy?: boolean } = {},
): string {
    const extended = options.extended ?? false;

    return toCompiledSource(pattern, parsePattern(pattern, { extended }).root, {
        extended,
        ungreedy: options.ungreedy ?? false,
    });
}

describe("toCompiledSource", () => {
    test("leaves a pattern alone when neither x nor U is on", () => {
        const pattern = String.raw`^\s*(a+?|b*)\s*$`;

        expect(rewrite(pattern)).toBe(pattern);
    });

    describe("the x flag", () => {
        test("drops unescaped whitespace", () => {
            expect(rewrite("a  b\tc", { extended: true })).toBe("abc");
        });

        test("drops # comments to end of line", () => {
            expect(rewrite("a # the letter a\nb", { extended: true })).toBe("ab");
        });

        test("keeps whitespace inside a character class", () => {
            expect(rewrite("[a b]", { extended: true })).toBe("[a b]");
        });

        test("keeps escaped whitespace", () => {
            expect(rewrite(String.raw`a\ b`, { extended: true })).toBe(String.raw`a\ b`);
        });

        test("the rewritten pattern still compiles", () => {
            const source = rewrite("^ \\d{4} - \\d{2} $ # a date", { extended: true });

            expect(new RegExp(source).test("2026-07")).toBe(true);
        });
    });

    describe("the U flag", () => {
        test("makes a greedy quantifier lazy", () => {
            expect(rewrite("a+b*c?", { ungreedy: true })).toBe("a+?b*?c??");
        });

        test("makes an explicitly lazy quantifier greedy", () => {
            expect(rewrite("a+?", { ungreedy: true })).toBe("a+");
        });

        test("inverts counted repetition too", () => {
            expect(rewrite("a{2,6}", { ungreedy: true })).toBe("a{2,6}?");
        });

        test("leaves a possessive quantifier alone", () => {
            expect(rewrite("a++", { ungreedy: true })).toBe("a++");
        });

        test("does not touch a ? that is not a quantifier", () => {
            expect(rewrite("(?:ab)", { ungreedy: true })).toBe("(?:ab)");
        });

        test("changes what the pattern actually matches", () => {
            const greedy = new RegExp(rewrite("<.+>"));
            const lazy = new RegExp(rewrite("<.+>", { ungreedy: true }));

            expect(greedy.exec("<a><b>")?.[0]).toBe("<a><b>");
            expect(lazy.exec("<a><b>")?.[0]).toBe("<a>");
        });

        test("rewrites nested quantifiers back to front without corrupting offsets", () => {
            expect(rewrite("(a+b*)+", { ungreedy: true })).toBe("(a+?b*?)+?");
        });
    });

    test("x and U apply together", () => {
        expect(rewrite("a+ b* # both", { extended: true, ungreedy: true })).toBe("a+?b*?");
    });
});

describe("compilePattern", () => {
    test("returns the engine's regex for a valid pattern", () => {
        const result = compilePattern("a+", toEngineFlags(["global"]));

        expect(result.ok).toBe(true);
        expect(result.ok && result.regex.source).toBe("a+");
        expect(result.ok && result.regex.global).toBe(true);
    });

    test("passes the engine's own message through for an invalid one", () => {
        const result = compilePattern("(", "d");

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.message.length).toBeGreaterThan(0);
    });

    test("does not throw on anything the parser lets through", () => {
        for (const pattern of ["(", "[", "a\\", "*", "(?<", "\\u{", "(?R)", "a++"]) {
            expect(() => compilePattern(pattern, "d")).not.toThrow();
        }
    });
});
