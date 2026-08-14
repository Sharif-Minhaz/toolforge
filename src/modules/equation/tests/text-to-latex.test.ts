import { describe, expect, test } from "bun:test";

import { MAX_EQUATION_INPUT_LENGTH, MAX_EQUATIONS } from "@/modules/equation/domain/constants";
import {
    convertLine,
    convertTextToLatex,
    readEquation,
} from "@/modules/equation/domain/text-to-latex";
import { renderMath } from "@/modules/tools/domain/math";

/** Every assertion below is about the LaTeX, so a failure here is a test bug. */
function latex(line: string): string {
    return convertLine(line).latex;
}

function notes(line: string): readonly string[] {
    return convertLine(line).notes;
}

describe("the three shapes the tool exists for", () => {
    test("implied powers, where the digits lost their superscript", () => {
        expect(latex("x2 + y2 = r2")).toBe("x^2 + y^2 = r^2");
    });

    test("a big operator with its limits and a fraction body", () => {
        expect(latex("sum i=1 to n of i^2 = n(n+1)(2n+1)/6")).toBe(
            "\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}",
        );
    });

    test("an integral with a differential and a root", () => {
        expect(latex("integral from 0 to infinity of e^(-x^2) dx = sqrt(pi)/2")).toBe(
            "\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
        );
    });
});

describe("implied powers", () => {
    test("only a single letter takes one", () => {
        // `sin2` is a mistyped function, not `sin` squared.
        expect(latex("sin2 x")).toBe("\\sin2 x");
    });

    test("cannot tell a power from a name, and does not pretend to", () => {
        // `h264` is the codec, and this reads it as h to the 264. There is no
        // signal in the text that separates it from `x2`, so the rule stays
        // consistent and the note says a power was guessed — which is the whole
        // reason the notes exist.
        expect(latex("h264")).toBe("h^{264}");
        expect(notes("h264")).toContain("implied_power");
    });

    test("a space means two atoms, not a power", () => {
        expect(latex("x 2")).toBe("x 2");
        expect(latex("x2")).toBe("x^2");
    });

    test("braces the exponent past one digit", () => {
        expect(latex("x10")).toBe("x^{10}");
    });

    test("leaves a symbol word alone", () => {
        // `pi2` is π² only if `pi` is read as a letter; it is a symbol, and
        // guessing a power on it would be a second guess on top of the first.
        expect(latex("pi2")).toBe("\\pi2");
    });

    test("says it guessed", () => {
        expect(notes("x2")).toContain("implied_power");
        expect(notes("x^2")).not.toContain("implied_power");
    });
});

describe("fractions", () => {
    test("takes the whole preceding term as the numerator", () => {
        expect(latex("n(n+1)/2")).toBe("\\frac{n(n+1)}{2}");
    });

    test("stops the numerator at the nearest term boundary", () => {
        expect(latex("x + y/2")).toBe("x + \\frac{y}{2}");
        expect(latex("a = b/c")).toBe("a = \\frac{b}{c}");
    });

    test("stops the denominator at the next boundary", () => {
        expect(latex("a/b + c")).toBe("\\frac{a}{b} + c");
    });

    test("associates left, so a/b/c is (a/b)/c", () => {
        expect(latex("a/b/c")).toBe("\\frac{\\frac{a}{b}}{c}");
    });

    test("leaves a half-typed division as a slash rather than an empty frac", () => {
        // `\frac{}{}` renders as a bare rule over nothing, which reads as a bug
        // rather than as an unfinished expression.
        expect(latex("a/")).toBe("a/");
        expect(latex("/b")).toBe("/b");
    });

    test("says it guessed", () => {
        expect(notes("a/b")).toContain("implied_fraction");
        expect(notes("a+b")).not.toContain("implied_fraction");
    });
});

describe("big operators", () => {
    test("reads the i=1 to n spelling", () => {
        expect(latex("sum i=1 to n")).toBe("\\sum_{i=1}^{n}");
    });

    test("reads the from/to spelling", () => {
        expect(latex("product from k=0 to m of k")).toBe("\\prod_{k=0}^{m} k");
    });

    test("gives lim a subscript and no upper limit", () => {
        expect(latex("lim as x->0 of sin(x)/x")).toBe("\\lim_{x \\to 0} \\frac{\\sin(x)}{x}");
    });

    test("takes a lower limit alone when there is no to", () => {
        expect(latex("sum from i of i")).toBe("\\sum_{i} i");
    });

    test("leaves an already-TeX operator entirely alone", () => {
        expect(latex("sum_{i=1}^{n} i")).toBe("\\sum_{i=1}^{n} i");
    });

    test("of is optional", () => {
        expect(latex("integral from 0 to 1 x dx")).toBe("\\int_{0}^{1} x\\,dx");
    });
});

describe("roots, functions and symbols", () => {
    test("wraps a root's argument in braces", () => {
        expect(latex("sqrt(x+1)")).toBe("\\sqrt{x+1}");
        expect(latex("cbrt(8)")).toBe("\\sqrt[3]{8}");
    });

    test("takes the next atom when the root has no brackets", () => {
        expect(latex("sqrt 2")).toBe("\\sqrt{2}");
    });

    test("renders absolute value with sized bars", () => {
        expect(latex("abs(x-1)")).toBe("\\left|x-1\\right|");
    });

    test("sets a named function upright", () => {
        expect(latex("log(x) + ln(y)")).toBe("\\log(x) + \\ln(y)");
    });

    test("maps the Greek names people type", () => {
        expect(latex("alpha + Omega + theta")).toBe("\\alpha + \\Omega + \\theta");
    });

    test("writes a Greek capital with no command of its own as its Latin letter", () => {
        // `\Alpha` does not exist in TeX. The capital alpha *is* an `A`.
        expect(latex("Alpha")).toBe("A");
    });

    test("maps the comparison operators", () => {
        expect(latex("a <= b != c >= d")).toBe("a \\leq b \\neq c \\geq d");
    });

    test("reads symbols pasted straight out of a document", () => {
        expect(latex("x ≤ ∞")).toBe("x \\leq \\infty");
        expect(latex("x² + y²")).toBe("x^2 + y^2");
        expect(latex("a₁ + a₂")).toBe("a_1 + a_2");
    });

    test("multiplies with a centred dot rather than an asterisk", () => {
        expect(latex("2 * 3")).toBe("2 \\cdot 3");
    });
});

describe("differentials", () => {
    test("only reads dx as one where an integral makes that the meaning", () => {
        expect(latex("integral of x dx")).toBe("\\int x\\,dx");
        // No integral in sight, so `dx` is two letters somebody multiplied.
        expect(latex("dx + dy")).toBe("dx + dy");
    });
});

describe("existing LaTeX passed back in", () => {
    test("leaves a command the reader typed exactly as it was", () => {
        expect(latex("\\frac{a}{b} + \\alpha")).toBe("\\frac{a}{b} + \\alpha");
    });

    test("survives its own output, which is the shape a second press produces", () => {
        const once = latex("sum i=1 to n of i^2 = n(n+1)(2n+1)/6");

        expect(latex(once)).toBe(once);
    });
});

describe("brackets", () => {
    test("keeps square brackets and escapes braces, which TeX would eat", () => {
        expect(latex("[a] + {b}")).toBe("[a] + \\{b\\}");
    });

    test("closes an unclosed bracket and says so", () => {
        expect(latex("(a + b")).toBe("(a + b)");
        expect(notes("(a + b")).toContain("closed_group");
        expect(notes("(a + b)")).not.toContain("closed_group");
    });

    test("keeps a stray closer rather than deleting what was typed", () => {
        expect(latex("a + b)")).toBe("a + b)");
    });
});

describe("LaTeX that arrived with its delimiters on", () => {
    function converted(text: string): { latex: string[]; display: boolean | null } {
        const result = convertTextToLatex(text);

        return result.ok
            ? { latex: result.equations.map((equation) => equation.latex), display: result.display }
            : { latex: [], display: null };
    }

    test("unwraps the five shapes an assistant answers in", () => {
        expect(converted("$$x^2$$").latex).toEqual(["x^2"]);
        expect(converted("\\[ x^2 \\]").latex).toEqual(["x^2"]);
        expect(converted("$x^2$").latex).toEqual(["x^2"]);
        expect(converted("\\(x^2\\)").latex).toEqual(["x^2"]);
        expect(converted("```latex\nx^2\n```").latex).toEqual(["x^2"]);
    });

    test("reads display mode off the delimiter, which the equation cannot carry", () => {
        expect(converted("$$x^2$$").display).toBe(true);
        expect(converted("\\[x^2\\]").display).toBe(true);
        expect(converted("$x^2$").display).toBe(false);
        expect(converted("\\(x^2\\)").display).toBe(false);
    });

    test("says nothing about display when the input carried no delimiters", () => {
        // `null` rather than a default: the reader's own switch is not something
        // a conversion should silently move.
        expect(converted("x2 + y2").display).toBeNull();
    });

    test("keeps a block spread over its own lines as one equation", () => {
        // The failure this prevents: three lines read as three equations, two of
        // which are punctuation.
        const result = converted("$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$");

        expect(result.latex).toEqual(["\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}"]);
        expect(result.display).toBe(true);
    });

    test("unwraps a list of wrapped equations line by line", () => {
        expect(converted("$x^2$\n$y^2$").latex).toEqual(["x^2", "y^2"]);
    });

    test("leaves a dollar sign that is not a delimiter where it is", () => {
        expect(converted("a \\$ b").latex).toEqual(["a \\$ b"]);
        expect(converted("a $ b").latex).toEqual(["a $ b"]);
    });

    test("does not mistake a lone delimiter for a wrapper", () => {
        expect(convertTextToLatex("$").ok).toBe(true);
        expect(converted("$").latex).toEqual(["$"]);
    });

    test("still converts plain text that happens to be unwrapped", () => {
        expect(converted("x2 + y2 = r2").latex).toEqual(["x^2 + y^2 = r^2"]);
    });
});

describe("digits touching a bracket", () => {
    test("reads (a+b)2 as a power, the same as x2", () => {
        // What closed the bracket is one thing, and the digits touching it are
        // what it is raised to.
        expect(latex("a2+2ab+b2=(a+b)2")).toBe("a^2+2ab+b^2=(a+b)^2");
    });

    test("offers the same three readings a letter does", () => {
        const readings = readEquation("(x+1)3");

        expect(readings.map((reading) => reading.latex)).toEqual(["(x+1)^3", "(x+1)_3", "(x+1)3"]);
    });

    test("a space still means two atoms", () => {
        expect(latex("(x+1) 3")).toBe("(x+1) 3");
    });
});

describe("alternative readings", () => {
    function kinds(line: string): readonly string[] {
        return readEquation(line).map((reading) => reading.kind);
    }

    function latexOf(line: string, kind: string): string | undefined {
        return readEquation(line).find((reading) => reading.kind === kind)?.latex;
    }

    test("offers subscript and literal beside the power, for H2O", () => {
        // The case that forces the whole feature. Chemistry wants `H_2O`,
        // algebra wants `H^2`, and nothing in the three characters says which.
        expect(kinds("H2O")).toEqual(["power", "subscript", "literal"]);
        expect(latexOf("H2O", "power")).toBe("H^2O");
        expect(latexOf("H2O", "subscript")).toBe("H_2O");
        expect(latexOf("H2O", "literal")).toBe("H2O");
    });

    test("keeps the power reading first, whatever the line looks like", () => {
        // Fixed order rather than a scored guess: a heuristic that promoted the
        // subscript for `H2O` would be wrong often enough to mislead, and the
        // reader is already looking at every option.
        expect(readEquation("x2")[0].kind).toBe("power");
        expect(readEquation("H2O")[0].kind).toBe("power");
    });

    test("offers the narrower fraction where a term has more than one factor", () => {
        expect(kinds("n(n+1)(2n+1)/6")).toEqual(["power", "narrowFraction"]);
        expect(latexOf("n(n+1)(2n+1)/6", "narrowFraction")).toBe("n(n+1)\\frac{(2n+1)}{6}");
    });

    test("offers nothing when the line says what it means", () => {
        // Explicit `^` and `_` are not a guess, so there is nothing to choose
        // between and the picker stays hidden.
        expect(kinds("a^2 + b_1")).toEqual(["power"]);
        expect(convertLine("a^2 + b_1").readings).toEqual([]);
    });

    test("collapses readings that came out identical", () => {
        expect(kinds("x + y")).toHaveLength(1);
    });

    test("attaches the alternatives to the equation, best first", () => {
        const equation = convertLine("H2O");

        expect(equation.latex).toBe(equation.readings[0].latex);
        expect(equation.readings).toHaveLength(3);
    });

    test("names the subscript guess as its own note, not as a power", () => {
        expect(latexNotes("H2O", "subscript")).toContain("implied_subscript");
        expect(latexNotes("H2O", "power")).toContain("implied_power");
        // Reading the digits as written is not a guess at all.
        expect(latexNotes("H2O", "literal")).toEqual([]);
    });

    function latexNotes(line: string, kind: string): readonly string[] {
        return readEquation(line).find((reading) => reading.kind === kind)?.notes ?? [];
    }

    test("every reading it offers still parses as LaTeX", () => {
        for (const line of ["H2O", "n(n+1)(2n+1)/6", "x2 + y2 = r2", "C6H12O6"]) {
            for (const reading of readEquation(line)) {
                const rendered = renderMath(reading.latex, true);

                expect(rendered.ok ? "" : rendered.message).toBe("");
            }
        }
    });
});

describe("convertTextToLatex", () => {
    test("makes one equation per non-blank line", () => {
        const result = convertTextToLatex("x2\n\ny2\n");

        expect(result.ok && result.equations.map((equation) => equation.latex)).toEqual([
            "x^2",
            "y^2",
        ]);
    });

    test("keeps the source line beside the LaTeX, for the tab and the export", () => {
        const result = convertTextToLatex("  x2 + y2  ");

        expect(result.ok && result.equations[0].source).toBe("x2 + y2");
    });

    test("refuses input that is only whitespace", () => {
        for (const blank of ["", "   ", "\n\n"]) {
            expect(convertTextToLatex(blank)).toEqual({ ok: false, reason: "empty_input" });
        }
    });

    test("refuses more lines than the tab strip can carry", () => {
        const lines = Array.from({ length: MAX_EQUATIONS + 1 }, (_, index) => `x${index}`);

        expect(convertTextToLatex(lines.join("\n"))).toEqual({
            ok: false,
            reason: "too_many_equations",
        });
    });

    test("accepts exactly the ceiling", () => {
        const lines = Array.from({ length: MAX_EQUATIONS }, (_, index) => `x${index}`);
        const result = convertTextToLatex(lines.join("\n"));

        expect(result.ok && result.equations).toHaveLength(MAX_EQUATIONS);
    });

    test("refuses input past the length ceiling, measured in code points", () => {
        expect(convertTextToLatex("a".repeat(MAX_EQUATION_INPUT_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
        expect(convertTextToLatex("🙂".repeat(MAX_EQUATION_INPUT_LENGTH)).ok).toBe(true);
    });

    test("is deterministic", () => {
        const source = "sum i=1 to n of i^2 = n(n+1)(2n+1)/6";

        expect(convertTextToLatex(source)).toEqual(convertTextToLatex(source));
    });
});

/**
 * The cross-check rule: verify against something that is not you.
 *
 * Every assertion above is this file's opinion of what the LaTeX should say.
 * These two are KaTeX's opinion of whether it is LaTeX at all — a different
 * implementation, written by other people, which is the only thing here that can
 * catch a rule that produces confident nonsense.
 */
describe("everything it emits parses as LaTeX", () => {
    const SOURCES = [
        "x2 + y2 = r2",
        "sum i=1 to n of i^2 = n(n+1)(2n+1)/6",
        "integral from 0 to infinity of e^(-x^2) dx = sqrt(pi)/2",
        "lim as x->0 of sin(x)/x",
        "abs(x-1) <= delta",
        "(a + b",
        "a/b/c",
        "x² + y² = r²",
        "product from k=0 to m of k",
        "alpha + Omega + theta",
        "[a] + {b}",
        "2 * 3 != 7",
        "sqrt 2",
        "a + b)",
        "cbrt(8) + log(x)",
    ];

    for (const source of SOURCES) {
        test(`KaTeX parses the output of "${source}"`, () => {
            const result = renderMath(convertLine(source).latex, true);

            expect(result.ok ? "" : result.message).toBe("");
        });
    }
});
