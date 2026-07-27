import katex from "katex";

export type MathRenderResult =
    { readonly ok: true; readonly html: string } | { readonly ok: false; readonly message: string };

/**
 * TeX to KaTeX markup.
 *
 * The only string in this tool that reaches `dangerouslySetInnerHTML`, and it
 * is KaTeX's output rather than the author's input: KaTeX escapes what it
 * cannot interpret, and `trust` stays at its default `false`, which turns
 * `\href`, `\url` and `\includegraphics` into red error text instead of markup.
 *
 * Failures come back typed. `throwOnError` is left on deliberately — KaTeX's
 * own fallback renders the broken source in red with no explanation, whereas a
 * caught `ParseError` carries the position and the reason.
 */
export function renderMath(tex: string, display: boolean): MathRenderResult {
    try {
        return {
            ok: true,
            html: katex.renderToString(tex, {
                displayMode: display,
                throwOnError: true,
                strict: false,
                // MathML alongside the visual output is what a screen reader
                // actually reads; dropping it would silence the equation.
                output: "htmlAndMathml",
            }),
        };
    } catch (caught) {
        return {
            ok: false,
            message: caught instanceof Error ? caught.message : String(caught),
        };
    }
}
