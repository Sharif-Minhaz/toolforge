import { describe, expect, test } from "bun:test";

import { lintPattern } from "@/modules/regex/domain/lint";
import { parsePattern } from "@/modules/regex/domain/parse";
import type { RegexDiagnostic } from "@/modules/regex/types";

function lint(pattern: string): readonly RegexDiagnostic[] {
    return lintPattern(pattern, parsePattern(pattern).root);
}

describe("lintPattern", () => {
    test("a plain pattern raises nothing", () => {
        expect(lint(String.raw`^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,6}$`)).toEqual([]);
    });

    describe("constructs ECMAScript cannot run", () => {
        const unsupported = ["(?>a+)", "a++", "(?R)", "(?1)", "(?#note)", "(?i)"];

        for (const pattern of unsupported) {
            test(pattern, () => {
                const errors = lint(pattern).filter(
                    (diagnostic) => diagnostic.code === "unsupportedConstruct",
                );

                expect(errors.length).toBeGreaterThan(0);
                expect(errors[0].severity).toBe("error");
                expect(pattern.slice(errors[0].start, errors[0].end)).toBe(errors[0].source);
            });
        }

        // These do compile, so flagging them would be a false alarm.
        test("the (?i:…) form is left alone", () => {
            expect(lint("(?i:a)")).toEqual([]);
        });

        test("a lazy quantifier is not a possessive one", () => {
            expect(lint("a+?")).toEqual([]);
        });
    });

    describe("nested quantifiers", () => {
        test("warns about the classic catastrophic shape", () => {
            const warnings = lint("(a+)+");

            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toMatchObject({ code: "nestedQuantifier", severity: "warning" });
        });

        test("covers the quantifier in the reported span", () => {
            const [warning] = lint("(a+)*");

            expect("(a+)*".slice(warning.start, warning.end)).toBe("(a+)*");
        });

        test("warns for an unbounded outer bound too", () => {
            expect(lint("(a*)  {2,}".replace(/\s+/g, ""))).toHaveLength(1);
        });

        test("a single quantifier is fine", () => {
            expect(lint("(a)+")).toEqual([]);
            expect(lint("a+b+")).toEqual([]);
        });

        test("an optional wrapper is not a risk", () => {
            expect(lint("(a+)?")).toEqual([]);
        });

        test("finds it through a non-capturing wrapper", () => {
            expect(lint("(?:\\d+)+")).toHaveLength(1);
        });
    });

    test("diagnostics come back in pattern order", () => {
        const diagnostics = lint("(a+)+(?>b)");

        expect(diagnostics.map((diagnostic) => diagnostic.start)).toEqual(
            diagnostics.map((diagnostic) => diagnostic.start).toSorted((a, b) => a - b),
        );
    });
});
