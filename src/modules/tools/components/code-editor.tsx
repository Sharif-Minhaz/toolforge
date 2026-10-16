"use client";

import { useRef, type ChangeEvent, type CSSProperties, type UIEvent } from "react";

import { cn } from "@/lib/utils";
import {
    highlight,
    splitTokenLines,
    type HighlightLanguage,
    type Token,
} from "../domain/highlight";
import { CODE_PADDING, CODE_TEXT, HighlightedCode, TokenSpans } from "./code-block";

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
 *
 * **The wrapper is a grid**, and that is the fourth alignment rule rather than a
 * style choice. The backdrop is out of flow, so the wrapper's height came from
 * the textarea alone — which meant a caller passing `min-h-56` stretched the
 * wrapper and the backdrop to 14rem while the textarea stayed at its own 8rem.
 * The resize grip, which the browser draws at the *textarea's* bottom-right,
 * then floated in the middle of the box with six rems of empty highlighted panel
 * below it. One grid item stretches to the wrapper's content box, so the
 * textarea is exactly as tall as the frame around it whatever floor a caller
 * sets, and dragging the grip grows the row and the backdrop with it.
 *
 * **Line numbers live in the backdrop**, inside a left padding both elements
 * share. The backdrop then draws one block per line with its number hung in that
 * padding, so a wrapped line keeps one number and the rows below it still line
 * up — each block wraps exactly as the textarea's own line does, because they
 * have the same width. Being part of the backdrop is also what keeps them out of
 * a copy: the selection is the textarea's, and the textarea never held them.
 */

/** The gap between a line's number and its text. */
const GUTTER_GAP = "0.75rem";

type CodeEditorProps = {
    id: string;
    value: string;
    language: HighlightLanguage;
    placeholder?: string;
    ariaDescribedBy?: string;
    onChange: (value: string) => void;
    /** A number beside every line, for documents long enough to navigate. */
    lineNumbers?: boolean;
    className?: string;
};

export function CodeEditor({
    id,
    value,
    language,
    placeholder,
    ariaDescribedBy,
    onChange,
    lineNumbers = false,
    className,
}: CodeEditorProps) {
    const backdropRef = useRef<HTMLPreElement>(null);
    const lineCount = lineNumbers ? countLines(value) : 0;
    // Identical on both elements, or the text starts at two different columns.
    // `ch` resolves against the code font, so the gutter fits the widest number.
    const gutterStyle: CSSProperties | undefined = lineNumbers
        ? { paddingLeft: `calc(0.875rem + ${String(lineCount).length}ch + ${GUTTER_GAP})` }
        : undefined;

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
                // `grid` rather than the default block: see the note above.
                "bg-card/70 ring-border/70 focus-within:ring-ring/60 relative grid min-h-32 min-w-0 rounded-xl ring-1 transition-shadow duration-200 ring-inset focus-within:ring-2",
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
                style={gutterStyle}
            >
                {lineNumbers ? (
                    // No trailing newline here: a value ending in one already
                    // splits into a last, empty line, and that row is drawn.
                    <code>
                        <NumberedLines value={value} language={language} />
                    </code>
                ) : (
                    <code>
                        <HighlightedCode code={value} language={language} />
                        {/* A value ending in a newline puts the caret on a line the
                            backdrop would otherwise not have, and the box would
                            scroll one line short of it. */}
                        {"\n"}
                    </code>
                )}
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
                    // The wrapper's only grid item, so it stretches to the frame
                    // and the grip lands on the frame's own bottom edge. No
                    // `max-h`: the cap belonged to the old block layout, and a
                    // resize affordance that stops a few rems down reads as
                    // broken rather than as deliberate.
                    "relative block min-h-32 w-full resize-y overflow-auto rounded-xl border-0 bg-transparent",
                    "scrollbar-gutter-stable",
                    // The glyphs are transparent so the backdrop shows through;
                    // the caret and the selection are not, or there would be no
                    // way to see where you are typing.
                    "caret-foreground selection:bg-primary/25 text-transparent",
                    "placeholder:text-muted-foreground/70",
                    "focus:ring-0 focus:outline-none",
                )}
                style={gutterStyle}
            />
        </div>
    );
}

function countLines(value: string): number {
    let count = 1;

    for (let index = value.indexOf("\n"); index !== -1; index = value.indexOf("\n", index + 1)) {
        count += 1;
    }

    return count;
}

/**
 * One block per line of the value.
 *
 * JSON is highlighted a line at a time, because it has no token that crosses a
 * newline — a string cannot hold a raw one — so cutting first changes nothing
 * about the colour. What it changes is the cost: each row scans only its own
 * line and is skipped while that line is unchanged, so a long document keeps its
 * colour past the whole-text ceiling and a keystroke rescans one line, not all.
 * A language whose tokens can span lines (a block comment, a GraphQL
 * description) is scanned whole and cut afterwards.
 */
function NumberedLines({ value, language }: { value: string; language: HighlightLanguage }) {
    if (language === "json") {
        return value
            .split("\n")
            .map((line, index) => <JsonLine key={index} number={index + 1} text={line} />);
    }

    return splitTokenLines(highlight(value, language)).map((tokens, index) => (
        <NumberedLine key={index} number={index + 1} tokens={tokens} />
    ));
}

function JsonLine({ number, text }: { number: number; text: string }) {
    return <NumberedLine number={number} tokens={highlight(text, "json")} />;
}

function NumberedLine({ number, tokens }: { number: number; tokens: readonly Token[] }) {
    return (
        // `min-h-6` is one `leading-6` line, so an empty line still takes the
        // height the textarea gives it.
        <span className="relative block min-h-6">
            {/* The number is generated content, so even a selection that
                somehow reached the backdrop would carry no digits. */}
            <span
                aria-hidden="true"
                data-line={number}
                className="text-muted-foreground/55 absolute right-full tabular-nums select-none before:content-[attr(data-line)]"
                style={{ paddingRight: GUTTER_GAP }}
            />
            <TokenSpans tokens={tokens} />
        </span>
    );
}
