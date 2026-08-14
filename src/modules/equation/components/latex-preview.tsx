"use client";

import "katex/dist/katex.min.css";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { renderMath } from "@/modules/tools/domain/math";

type LatexPreviewProps = {
    latex: string;
    display: boolean;
    /** Dimmed while the debounce settles, rather than blanked. */
    pending: boolean;
    labelledBy: string;
};

/**
 * The verification half of the tool, and the reason the generated LaTeX can be
 * called a suggestion at all.
 *
 * Two things it must never do. It must not crash the page on malformed source —
 * `renderMath` returns a typed failure rather than throwing, so a half-edited
 * `\frac{` renders as an explanation instead of a stack trace. And it must not
 * inject anything the reader wrote: the string handed to `dangerouslySetInnerHTML`
 * is KaTeX's own output, produced with `trust: false`, which turns `\href`,
 * `\url` and `\includegraphics` into visible error text rather than markup. See
 * `tools/domain/math.ts`.
 *
 * KaTeX's own message is shown under the localised sentence. That is safe here
 * in a way an engine message usually is not: KaTeX is a pure-JavaScript library
 * bundled into the page, so it says the same words on the server and in the tab
 * — and the failure path is only reachable after a hand edit, which is to say
 * only on the client.
 */
export function LatexPreview({ latex, display, pending, labelledBy }: LatexPreviewProps) {
    const t = useTranslations("equation.workbench");
    const tErrors = useTranslations("equation.errors");
    const trimmed = latex.trim();

    const body = (() => {
        if (trimmed.length === 0) {
            return <p className="text-muted-foreground text-[0.8125rem]">{t("previewEmpty")}</p>;
        }

        const result = renderMath(trimmed, display);

        if (!result.ok) {
            return (
                <div className="flex flex-col items-start gap-2 text-left">
                    <p className="text-destructive text-[0.8125rem] font-medium">
                        {tErrors("renderFailed")}
                    </p>
                    <code className="text-muted-foreground bg-muted/60 ring-border/60 max-w-full overflow-x-auto rounded-md px-2 py-1 font-mono text-[0.6875rem] ring-1 ring-inset">
                        {result.message}
                    </code>
                </div>
            );
        }

        return (
            // A wide equation scrolls inside its own box; the page never does.
            //
            // Two elements rather than one, and the split is what keeps the
            // scrollbar from appearing under equations that fit. The scroller
            // is full width, so an equation narrower than the box does not
            // overflow it at all — a shrink-to-fit scroller would be exactly as
            // wide as its contents, and KaTeX rounds its own width up by a
            // fraction of a pixel, which is enough to show a bar under every
            // formula. The inner box is `w-max` so it stays its natural width
            // and `mx-auto` centres it; once it is wider than the scroller the
            // auto margins collapse to zero, which is what keeps the left edge
            // of a genuinely wide equation reachable.
            <div className="w-full overflow-x-auto overflow-y-hidden py-1">
                <div className="mx-auto w-max" dangerouslySetInnerHTML={{ __html: result.html }} />
            </div>
        );
    })();

    return (
        <div
            role="figure"
            aria-labelledby={labelledBy}
            className={cn(
                "bg-muted/40 ring-border/70 flex min-h-32 flex-col items-center justify-center rounded-xl px-4 py-6 ring-1 ring-inset",
                "transition-opacity duration-200",
                pending && "opacity-55",
            )}
        >
            {body}
        </div>
    );
}
