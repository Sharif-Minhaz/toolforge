import { z } from "zod";

import { DEFAULT_DISPLAY_MODE } from "@/modules/equation/domain/constants";
import { formatEquation } from "@/modules/equation/domain/formats";
import { convertTextToLatex } from "@/modules/equation/domain/text-to-latex";
import { equationInputSchema, outputFormatSchema } from "@/modules/equation/validation/equation";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const equationConvertTool = defineMcpTool({
    toolId: "equation",
    verb: "convert",
    title: "Convert plain-text maths to LaTeX",
    description:
        "Turn plain-text maths into LaTeX. Reads implied powers (x2), fractions (a/b), roots (sqrt(x)), Greek names, ASCII relations (<=, ->), named functions and sigma notation (sum i=1 to n of ...), and passes existing LaTeX through untouched. One equation per input line. Returns the LaTeX in the requested format, the guesses it had to make, and every other defensible reading of the same line — `H2O` comes back as H^2O with H_2O and H2O beside it, because nothing in the text says which was meant. Pick from `readings` rather than assuming the first one, or write `_` and `^` in the input to settle it outright.",
    kind: "offline",
    inputSchema: z.object({
        text: equationInputSchema.describe(
            "The maths, one equation per line. Delimiters are stripped, so text copied out of a document or a chat reply can be passed straight through: $...$, $$...$$, \\(...\\), \\[...\\] and fenced ```latex blocks are all unwrapped, and a block whose delimiters sit on their own lines stays one equation",
        ),
        format: outputFormatSchema
            .default("latex")
            .describe(
                "latex is the bare source; markdown wraps it in single dollars; markdownBlock in fenced double dollars; mathml renders it through KaTeX",
            ),
        display: z
            .boolean()
            .default(DEFAULT_DISPLAY_MODE)
            .describe("Display (block) rather than inline. Only affects markdown and mathml"),
    }),
    run: ({ text, format, display }) => {
        const result = convertTextToLatex(text);

        if (!result.ok) {
            return refuseWithReason("Equation converter", result.reason, { format });
        }

        // Delimiters in the input outrank the argument's default, because they
        // are evidence about this equation while the default is only a fallback
        // — `$$…$$` was written as a block by whoever wrote it. An explicit
        // `display` still wins, since that is the caller stating a preference.
        const resolved = display === DEFAULT_DISPLAY_MODE ? (result.display ?? display) : display;

        const equations = result.equations.map((equation) => {
            const formatted = formatEquation(equation.latex, format, resolved);

            return {
                source: equation.source,
                latex: equation.latex,
                // The requested format sits beside the raw LaTeX rather than
                // replacing it: `mathml` is the one format that can fail, and a
                // caller with the LaTeX in hand can still do something useful.
                formatted: formatted.ok ? formatted.text : null,
                formatError: formatted.ok ? null : formatted.message,
                notes: [...equation.notes],
                // The alternatives, so a caller that knows the context can pick
                // the reading this side had no way to choose. Empty when the
                // line was unambiguous, which is the useful signal in itself.
                readings: equation.readings.map((reading) => ({
                    kind: reading.kind,
                    latex: reading.latex,
                    notes: [...reading.notes],
                })),
            };
        });

        return succeed(
            equations.map((equation) => equation.formatted ?? equation.latex).join("\n\n"),
            // `display` is what was actually used, not what was asked for — a
            // caller cannot see the delimiters that may have overridden it.
            { equations, format, display: resolved },
        );
    },
});
