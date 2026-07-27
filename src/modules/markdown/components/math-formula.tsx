"use client";

import { cn } from "@/lib/utils";
import { renderMath } from "../domain/math";

type MathFormulaProps = {
    tex: string;
    display: boolean;
};

/**
 * The one place in the preview that injects markup, and the string comes from
 * KaTeX rather than from the author — see `domain/math.ts` for why that is safe.
 *
 * Broken TeX falls back to the source in destructive colour with KaTeX's own
 * message on the tooltip, so a half-typed formula reads as unfinished instead of
 * blanking the paragraph it sits in.
 */
export function MathFormula({ tex, display }: MathFormulaProps) {
    const result = renderMath(tex, display);

    if (!result.ok) {
        return (
            <code
                title={result.message}
                className={cn(
                    "text-destructive bg-destructive/8 ring-destructive/25 rounded px-1 py-0.5 font-mono text-[0.85em] ring-1 ring-inset",
                    display && "my-4 block overflow-x-auto p-3 text-center",
                )}
            >
                {tex}
            </code>
        );
    }

    return (
        <span
            // A wide equation scrolls inside its own box; the page never does.
            className={cn(display && "my-5 block overflow-x-auto overflow-y-hidden py-1")}
            dangerouslySetInnerHTML={{ __html: result.html }}
        />
    );
}
