import { describe, expect, test } from "bun:test";

import { renderMath, renderMathMl } from "@/modules/tools/domain/math";

describe("renderMath", () => {
    test("renders a formula to KaTeX markup", () => {
        const result = renderMath("E = mc^2", false);

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.html).toContain('class="katex"');
        }
    });

    test("emits MathML alongside the visual output, which is what is read aloud", () => {
        const result = renderMath("x^2", false);

        expect(result.ok && result.html).toContain("<math");
    });

    test("marks display mode, which is what centres the equation", () => {
        const inline = renderMath("x", false);
        const display = renderMath("x", true);

        expect(inline.ok && inline.html).not.toContain("katex-display");
        expect(display.ok && display.html).toContain("katex-display");
    });

    test("returns a typed failure instead of throwing on broken TeX", () => {
        const result = renderMath("\\frac{", false);

        expect(result.ok).toBe(false);

        if (!result.ok) {
            expect(result.message).toContain("KaTeX parse error");
        }
    });

    test("refuses \\href, which would otherwise smuggle a URL past the link check", () => {
        const result = renderMath("\\href{javascript:alert(1)}{x}", false);

        // `trust` is off, so KaTeX renders the command as visible error text
        // rather than an anchor. Either outcome is safe; a link is not.
        expect(result.ok && result.html).not.toContain("javascript:alert(1)</a>");
        expect(result.ok && result.html).not.toContain("<a href");
    });
});

describe("renderMathMl", () => {
    test("returns MathML with none of KaTeX's presentation markup around it", () => {
        const result = renderMathMl("\\frac{a}{b}", false);

        expect(result.ok).toBe(true);

        if (result.ok) {
            expect(result.html).toContain("<mfrac");
            // The visual half is what a caller pasting into a document does not
            // want, and it is the whole reason this is a second function.
            expect(result.html).not.toContain("katex-html");
        }
    });

    test("hands back a bare element, with KaTeX's styling wrapper unwrapped", () => {
        const result = renderMathMl("x", false);

        expect(result.ok && result.html.startsWith("<math")).toBe(true);
        expect(result.ok && result.html.endsWith("</math>")).toBe(true);
        expect(result.ok && result.html).not.toContain("<span");
    });

    test("marks display mode, which a document reads as a block equation", () => {
        const inline = renderMathMl("x", false);
        const display = renderMathMl("x", true);

        // Inline carries no attribute at all: `inline` is MathML's own default,
        // and writing it out would be markup nobody asked for.
        expect(inline.ok && inline.html).not.toContain("display=");
        expect(display.ok && display.html).toContain('display="block"');
    });

    test("returns a typed failure instead of throwing on broken TeX", () => {
        const result = renderMathMl("\\frac{", false);

        expect(result.ok).toBe(false);

        if (!result.ok) {
            expect(result.message).toContain("KaTeX parse error");
        }
    });
});
