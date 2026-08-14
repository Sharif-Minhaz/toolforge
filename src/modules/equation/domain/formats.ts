import { renderMathMl } from "@/modules/tools/domain/math";
import type { ConvertedEquation, FormatResult, OutputFormat } from "../types";

/**
 * The finished LaTeX, wrapped for wherever it is going.
 *
 * Three of the four are string wrapping. `mathml` is the one that can fail —
 * KaTeX has to parse the source to produce it — so every format goes through a
 * typed result rather than three returning a string and one throwing.
 */
export function formatEquation(
    latex: string,
    format: OutputFormat,
    display: boolean,
): FormatResult {
    if (latex.trim().length === 0) {
        return { ok: false, message: "" };
    }

    switch (format) {
        case "latex":
            return { ok: true, text: latex };
        case "markdown":
            // Single dollars, on one line. This is the inline form, and a
            // newline inside it ends the span in most Markdown parsers.
            return { ok: true, text: `$${latex}$` };
        case "markdownBlock":
            // The fences go on their own lines. `$$x$$` on one line is display
            // maths in some parsers and inline in others; the three-line form is
            // read the same way everywhere.
            return { ok: true, text: `$$\n${latex}\n$$` };
        case "mathml": {
            const rendered = renderMathMl(latex, display);

            return rendered.ok
                ? { ok: true, text: rendered.html }
                : { ok: false, message: rendered.message };
        }
    }
}

/**
 * Every equation in one block, for "copy all".
 *
 * Separated by a blank line rather than a newline: in Markdown that is what
 * keeps two display equations from being read as one paragraph, and in a plain
 * `.tex` paste it is simply easier to read.
 */
export function formatAll(
    equations: readonly ConvertedEquation[],
    format: OutputFormat,
    display: boolean,
): FormatResult {
    const parts: string[] = [];

    for (const equation of equations) {
        const formatted = formatEquation(equation.latex, format, display);

        if (!formatted.ok) {
            return formatted;
        }

        parts.push(formatted.text);
    }

    return parts.length === 0 ? { ok: false, message: "" } : { ok: true, text: parts.join("\n\n") };
}
