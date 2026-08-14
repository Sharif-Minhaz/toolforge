import { describe, expect, test } from "bun:test";

import { formatAll, formatEquation } from "@/modules/equation/domain/formats";
import {
    buildEquationExportFilename,
    createEquationExportFile,
} from "@/modules/equation/domain/export";
import { OUTPUT_FORMATS, type ConvertedEquation } from "@/modules/equation/types";
import {
    equationSearchParamsSchema,
    outputFormatSchema,
} from "@/modules/equation/validation/equation";

const AT = new Date("2026-08-14T10:15:00.000Z");

function equation(latex: string, source = latex): ConvertedEquation {
    return { source, latex, notes: [], readings: [] };
}

describe("formatEquation", () => {
    test("hands back the LaTeX untouched", () => {
        expect(formatEquation("\\frac{a}{b}", "latex", false)).toEqual({
            ok: true,
            text: "\\frac{a}{b}",
        });
    });

    test("wraps inline Markdown in single dollars, on one line", () => {
        expect(formatEquation("\\frac{a}{b}", "markdown", false)).toEqual({
            ok: true,
            text: "$\\frac{a}{b}$",
        });
    });

    test("puts the display fences on their own lines", () => {
        // `$$x$$` on one line is display maths in some parsers and inline in
        // others; the three-line form is read the same way everywhere.
        expect(formatEquation("\\frac{a}{b}", "markdownBlock", true)).toEqual({
            ok: true,
            text: "$$\n\\frac{a}{b}\n$$",
        });
    });

    test("produces MathML through KaTeX", () => {
        const result = formatEquation("\\frac{a}{b}", "mathml", false);

        expect(result.ok && result.text.startsWith("<math")).toBe(true);
        expect(result.ok && result.text).toContain("<mfrac");
    });

    test("carries the display flag into the MathML", () => {
        const block = formatEquation("x", "mathml", true);

        expect(block.ok && block.text).toContain('display="block"');
    });

    test("fails MathML on source KaTeX cannot parse, and says why", () => {
        const result = formatEquation("\\frac{", "mathml", false);

        expect(result.ok).toBe(false);
        expect(!result.ok && result.message).toContain("KaTeX parse error");
    });

    test("refuses every format for an empty equation", () => {
        for (const format of OUTPUT_FORMATS) {
            expect(formatEquation("   ", format, false).ok).toBe(false);
        }
    });
});

describe("formatAll", () => {
    const equations = [equation("x^2"), equation("y^2")];

    test("separates equations with a blank line", () => {
        expect(formatAll(equations, "latex", false)).toEqual({ ok: true, text: "x^2\n\ny^2" });
    });

    test("wraps each one, not the batch", () => {
        expect(formatAll(equations, "markdown", false)).toEqual({
            ok: true,
            text: "$x^2$\n\n$y^2$",
        });
    });

    test("fails the whole batch when one equation cannot be rendered", () => {
        expect(formatAll([equation("x"), equation("\\frac{")], "mathml", false).ok).toBe(false);
    });

    test("refuses an empty batch", () => {
        expect(formatAll([], "latex", false).ok).toBe(false);
    });
});

describe("the .tex export", () => {
    test("names the file after the instant", () => {
        expect(buildEquationExportFilename(AT)).toBe("toolforge-equations-20260814T101500Z.tex");
    });

    test("writes each equation as a display block with its source above it", () => {
        const file = createEquationExportFile({
            equations: [equation("x^2 + y^2 = r^2", "x2 + y2 = r2")],
            generatedAt: AT,
        });

        expect(file.mimeType).toBe("text/x-tex;charset=utf-8");
        expect(file.content).toBe("% x2 + y2 = r2\n\\[\n  x^2 + y^2 = r^2\n\\]\n");
    });

    test("separates two equations with a blank line", () => {
        const file = createEquationExportFile({
            equations: [equation("x^2"), equation("y^2")],
            generatedAt: AT,
        });

        expect(file.content).toBe("% x^2\n\\[\n  x^2\n\\]\n\n% y^2\n\\[\n  y^2\n\\]\n");
    });

    test("leaves an empty export empty rather than writing a lone newline", () => {
        expect(createEquationExportFile({ equations: [], generatedAt: AT }).content).toBe("");
    });
});

describe("validation", () => {
    test("accepts every output format the UI can ask for", () => {
        for (const format of OUTPUT_FORMATS) {
            expect(outputFormatSchema.safeParse(format).success).toBe(true);
        }

        expect(outputFormatSchema.safeParse("pdf").success).toBe(false);
    });

    test("reads a shared link", () => {
        expect(equationSearchParamsSchema.parse({ text: "x2", display: "0" })).toEqual({
            text: "x2",
            display: "0",
        });
    });

    test("keeps display as a string rather than coercing it", () => {
        // `z.coerce.boolean()` calls `Boolean("0")`, which is true — the exact
        // opposite of what the link said. Hence the enum.
        expect(equationSearchParamsSchema.parse({ display: "0" }).display).toBe("0");
    });

    test("degrades one bad field to a default instead of throwing the page away", () => {
        const parsed = equationSearchParamsSchema.parse({ text: "keep me", display: "yes" });

        expect(parsed.text).toBe("keep me");
        expect(parsed.display).toBeUndefined();
    });
});
