import { describe, expect, test } from "bun:test";

import { renderMath } from "@/modules/markdown/domain/math";

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
