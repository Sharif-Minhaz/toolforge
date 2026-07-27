"use client";

import { cn } from "@/lib/utils";
import { tokenizeJson, type JsonTokenKind } from "../domain/highlight";

/**
 * One brand hue per value kind, so the palette is the same one the rest of the
 * site uses and both themes are already defined for it. Punctuation recedes;
 * plain runs — whitespace, mostly — inherit the surrounding colour.
 */
const TOKEN_CLASS: Record<JsonTokenKind, string> = {
    key: "text-brand-violet",
    string: "text-brand-emerald",
    number: "text-brand-cyan",
    boolean: "text-brand-amber",
    null: "text-brand-rose",
    punctuation: "text-muted-foreground",
    plain: "",
};

type JsonCodeProps = {
    code: string;
    /** Id of the element naming this region, since a `<pre>` takes no label. */
    labelledBy: string;
    /** Shown in place of the code when there is nothing to render yet. */
    placeholder: string;
    className?: string;
};

/**
 * The formatted document, coloured and resizable.
 *
 * Deliberately not a `<textarea>`: one cannot carry colour. It keeps the
 * textarea's sizing behaviour though — a fixed starting height with the
 * overflow scrolling inside, and a drag handle to make it as tall as you like.
 *
 * The height is set with `h-*`, never `max-h-*`. A maximum height still clamps
 * the inline height the browser writes while dragging, so the handle would stop
 * halfway down a long document — which is exactly what it used to do. Long
 * lines scroll inside too, so the page itself never scrolls sideways.
 */
export function JsonCode({ code, labelledBy, placeholder, className }: JsonCodeProps) {
    const tokens = tokenizeJson(code);

    return (
        <div
            // A scrollable region has to be reachable from the keyboard, which
            // is what the tabIndex is for.
            role="region"
            aria-labelledby={labelledBy}
            tabIndex={0}
            className={cn(
                "bg-muted/45 ring-border/60 h-72 min-h-40 resize-y overflow-auto rounded-xl ring-1 ring-inset",
                "focus-visible:ring-ring focus-visible:ring-2",
                className,
            )}
        >
            {tokens.length === 0 ? (
                <p className="text-muted-foreground p-3 font-mono text-[0.8125rem] leading-6">
                    {placeholder}
                </p>
            ) : (
                <pre className="w-max min-w-full p-3 font-mono text-[0.8125rem] leading-6">
                    <code>
                        {tokens.map((token, index) => (
                            <span
                                key={`${index}-${token.kind}`}
                                className={TOKEN_CLASS[token.kind]}
                            >
                                {token.text}
                            </span>
                        ))}
                    </code>
                </pre>
            )}
        </div>
    );
}
