"use client";

import { cn } from "@/lib/utils";
import { highlight, type HighlightLanguage, type TokenKind } from "../domain/highlight";

/**
 * Every property that decides where a glyph lands. The editor paints its
 * highlighted copy behind a transparent textarea, and the two only line up
 * while they agree on all of this — so it is one constant, shared, rather than
 * two class lists that look the same today.
 */
export const CODE_TEXT =
    "font-mono text-[0.8125rem] leading-6 tracking-normal whitespace-pre-wrap wrap-break-word";

export const CODE_PADDING = "p-3.5";

/**
 * Colour per token kind, from the `--syntax-*` tokens rather than the brand
 * hues. Both themes are covered by the variables; see the note in
 * `globals.css` for why code needs a palette of its own.
 */
const TOKEN_CLASS: Record<TokenKind, string> = {
    plain: "",
    comment: "text-muted-foreground italic",
    string: "text-syntax-string",
    number: "text-syntax-number",
    keyword: "text-syntax-keyword",
    command: "text-syntax-keyword font-medium",
    flag: "text-syntax-key",
    property: "text-syntax-key",
    function: "text-syntax-call",
    url: "text-syntax-call",
    operator: "text-muted-foreground",
    punctuation: "text-muted-foreground",
};

type HighlightedCodeProps = {
    code: string;
    language: HighlightLanguage;
};

/**
 * The spans alone, with no box around them, so the read-only block and the
 * editor's backdrop render identical markup from identical input.
 */
export function HighlightedCode({ code, language }: HighlightedCodeProps) {
    return (
        <>
            {highlight(code, language).map((token, index) => (
                <span key={index} className={TOKEN_CLASS[token.kind]}>
                    {token.text}
                </span>
            ))}
        </>
    );
}

type CodeBlockProps = {
    code: string;
    language: HighlightLanguage;
    /** Shown in place of the code when there is none yet. */
    placeholder?: string;
    /** Dimmed while a debounced input has yet to reach the converter. */
    pending?: boolean;
    className?: string;
};

export function CodeBlock({ code, language, placeholder, pending, className }: CodeBlockProps) {
    return (
        <div
            className={cn(
                "bg-muted/45 ring-border/70 min-w-0 overflow-auto rounded-xl ring-1 ring-inset",
                "transition-opacity duration-200",
                pending && "opacity-55",
                className,
            )}
        >
            <pre className={cn(CODE_TEXT, CODE_PADDING)}>
                {code.length > 0 ? (
                    <code>
                        <HighlightedCode code={code} language={language} />
                    </code>
                ) : (
                    <span className="text-muted-foreground/70">{placeholder}</span>
                )}
            </pre>
        </div>
    );
}
