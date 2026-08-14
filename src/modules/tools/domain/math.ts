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

/**
 * KaTeX wraps even its MathML-only output in a styling hook.
 *
 * Unwrapped here rather than left in place, because the caller is somebody
 * pasting MathML into a document rather than a browser painting a page, and a
 * `<span>` carrying a class from a library they do not use is not part of the
 * answer. The unwrap is a fixed prefix and suffix rather than a search for
 * `<math>`: if a future KaTeX stops emitting exactly this wrapper the guard
 * simply stops matching and the full string is returned, which is wrong-looking
 * rather than truncated.
 */
const MATHML_WRAPPER_OPEN = '<span class="katex">';
const MATHML_WRAPPER_CLOSE = "</span>";

function unwrapMathMl(html: string): string {
    if (!html.startsWith(MATHML_WRAPPER_OPEN) || !html.endsWith(MATHML_WRAPPER_CLOSE)) {
        return html;
    }

    return html.slice(MATHML_WRAPPER_OPEN.length, -MATHML_WRAPPER_CLOSE.length);
}

/**
 * The same formula as a bare `<math>` element.
 *
 * A separate call rather than a slice of `renderMath`'s output, because the two
 * answer different questions. `renderMath` produces something for a browser to
 * paint — MathML for the screen reader and a pile of positioned spans for the
 * eye — and digging the `<math>` back out of that is a far larger guess than the
 * fixed wrapper above.
 *
 * `throwOnError` stays on for the same reason it does above: a caught
 * `ParseError` says where the source is broken, while KaTeX's own fallback would
 * hand back markup that renders as red text and looks like a successful answer.
 */
export function renderMathMl(tex: string, display: boolean): MathRenderResult {
    try {
        return {
            ok: true,
            html: unwrapMathMl(
                katex.renderToString(tex, {
                    displayMode: display,
                    throwOnError: true,
                    strict: false,
                    output: "mathml",
                }),
            ),
        };
    } catch (caught) {
        return {
            ok: false,
            message: caught instanceof Error ? caught.message : String(caught),
        };
    }
}
