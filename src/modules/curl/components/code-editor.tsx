"use client";

import { useRef, type ChangeEvent, type UIEvent } from "react";

import { cn } from "@/lib/utils";
import type { HighlightLanguage } from "../domain/highlight";
import { CODE_PADDING, CODE_TEXT, HighlightedCode } from "./code-block";

/**
 * A textarea that looks highlighted.
 *
 * There is no such thing as a coloured `<textarea>` — its value is one string
 * with one colour. The way every code editor on the web solves it is the way
 * this does: paint the highlighted copy in a `<pre>` underneath, make the
 * textarea's own text transparent, and keep the two in lockstep. The textarea
 * stays a real textarea, so selection, undo, spellcheck, IME, autofill and
 * every screen reader behave exactly as they did.
 *
 * Three things keep them aligned, and all three are load-bearing:
 *
 * - **Identical text metrics.** `CODE_TEXT` and `CODE_PADDING` are shared
 *   constants rather than two matching class lists, because a font size or a
 *   wrap rule that drifts on one side shifts every glyph after it.
 * - **Both positioned.** An absolutely positioned element paints above a static
 *   one whatever the DOM order, so the textarea is `relative` too and comes
 *   second — otherwise the backdrop would sit on top and swallow every click.
 * - **Scroll is mirrored, not shared.** The textarea owns the scrollbar; the
 *   backdrop is `overflow-hidden` and follows in the scroll handler. Writing to
 *   the DOM node directly is right here — this has to land in the same frame as
 *   the scroll, and state would be a frame late.
 *
 * The subtle one is `scrollbar-gutter`. A classic scrollbar takes its width out
 * of the content box, so the moment the textarea overflows it becomes narrower
 * than the backdrop, every wrapped line breaks a word earlier, and the whole
 * thing slides out of register. Reserving the gutter on both keeps their content
 * boxes identical whether or not a scrollbar is showing. Browsers that ignore
 * the property are the ones with overlay scrollbars, which never took the width
 * in the first place.
 */

type CodeEditorProps = {
    id: string;
    value: string;
    language: HighlightLanguage;
    placeholder?: string;
    ariaDescribedBy?: string;
    onChange: (value: string) => void;
    className?: string;
};

export function CodeEditor({
    id,
    value,
    language,
    placeholder,
    ariaDescribedBy,
    onChange,
    className,
}: CodeEditorProps) {
    const backdropRef = useRef<HTMLPreElement>(null);

    function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
        const backdrop = backdropRef.current;

        if (backdrop === null) {
            return;
        }

        backdrop.scrollTop = event.currentTarget.scrollTop;
        backdrop.scrollLeft = event.currentTarget.scrollLeft;
    }

    return (
        <div
            className={cn(
                "bg-card/70 ring-border/70 focus-within:ring-ring/60 relative min-w-0 rounded-xl ring-1 transition-shadow duration-200 ring-inset focus-within:ring-2",
                className,
            )}
        >
            <pre
                ref={backdropRef}
                aria-hidden="true"
                className={cn(
                    CODE_TEXT,
                    CODE_PADDING,
                    "pointer-events-none absolute inset-0 overflow-hidden rounded-xl",
                    "scrollbar-gutter-stable",
                )}
            >
                <code>
                    <HighlightedCode code={value} language={language} />
                    {/* A value ending in a newline puts the caret on a line the
                        backdrop would otherwise not have, and the box would
                        scroll one line short of it. */}
                    {"\n"}
                </code>
            </pre>

            <textarea
                id={id}
                value={value}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                aria-describedby={ariaDescribedBy}
                className={cn(
                    CODE_TEXT,
                    CODE_PADDING,
                    "relative block max-h-72 min-h-32 w-full resize-y overflow-auto rounded-xl border-0 bg-transparent",
                    "scrollbar-gutter-stable",
                    // The glyphs are transparent so the backdrop shows through;
                    // the caret and the selection are not, or there would be no
                    // way to see where you are typing.
                    "caret-foreground selection:bg-primary/25 text-transparent",
                    "placeholder:text-muted-foreground/70",
                    "focus:ring-0 focus:outline-none",
                )}
            />
        </div>
    );
}
