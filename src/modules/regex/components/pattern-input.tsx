"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent, type UIEvent } from "react";

import { cn } from "@/lib/utils";
import { MAX_PATTERN_LENGTH } from "../domain/constants";
import { parseLiteral, type RegexLiteral } from "../domain/literal";
import type { HighlightKind, HighlightSpan } from "../types";
import {
    FIELD_INPUT,
    FIELD_INPUT_TRANSPARENT,
    FIELD_OVERLAY,
    FIELD_PADDING,
    FIELD_TEXT,
} from "./field-styles";

/**
 * One hue per construct, so a pattern can be read at a glance: what repeats,
 * what is a group, what is a class, and what is an assertion.
 */
const KIND_CLASS: Record<HighlightKind, string> = {
    plain: "text-foreground",
    anchor: "text-brand-rose font-semibold",
    quantifier: "text-brand-cyan font-semibold",
    group: "text-brand-violet",
    charClass: "text-brand-amber",
    escape: "text-brand-emerald",
    alternation: "text-brand-violet font-semibold",
    backreference: "text-brand-cyan",
    comment: "text-muted-foreground italic",
};

type PatternInputProps = {
    id: string;
    value: string;
    spans: readonly HighlightSpan[];
    label: string;
    placeholder: string;
    /** Tints the caret line when the engine rejected the pattern. */
    invalid: boolean;
    onChange: (value: string) => void;
    /** Fired when a pasted `/…/gm` should replace pattern, flags, and delimiter. */
    onPasteLiteral: (literal: RegexLiteral) => void;
};

export function PatternInput({
    id,
    value,
    spans,
    label,
    placeholder,
    invalid,
    onChange,
    onPasteLiteral,
}: PatternInputProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);

    function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
        const overlay = overlayRef.current;

        if (overlay !== null) {
            overlay.scrollLeft = event.currentTarget.scrollLeft;
        }
    }

    // A pattern is one line. Enter would grow the field and silently insert a
    // literal newline into the expression.
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter") {
            event.preventDefault();
        }
    }

    /**
     * Only a paste is read as a literal, never a keystroke. Typing `/a/` on the
     * way to `/a/b` would otherwise rewrite itself out from under the caret.
     */
    function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
        const literal = parseLiteral(event.clipboardData.getData("text"));

        if (literal === null) {
            return;
        }

        event.preventDefault();
        onPasteLiteral(literal);
    }

    return (
        <div className="relative min-w-0 flex-1">
            <div
                ref={overlayRef}
                aria-hidden="true"
                className={cn(FIELD_OVERLAY, FIELD_TEXT, FIELD_PADDING, "whitespace-pre")}
            >
                {value.length === 0 ? (
                    <span className="text-muted-foreground/70">{placeholder}</span>
                ) : (
                    spans.map((span) => (
                        <span key={span.start} className={KIND_CLASS[span.kind]}>
                            {value.slice(span.start, span.end)}
                        </span>
                    ))
                )}
            </div>

            <textarea
                id={id}
                rows={1}
                wrap="off"
                // Capped rather than merely checked: a pattern is one line, and
                // 1,000 characters is already far past any expression somebody
                // hand-writes. `analyze` still refuses one that arrives from a
                // shared link over the ceiling.
                maxLength={MAX_PATTERN_LENGTH}
                value={value}
                aria-label={label}
                aria-invalid={invalid}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => onChange(event.target.value.replace(/[\r\n]/g, ""))}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onScroll={handleScroll}
                className={cn(
                    FIELD_INPUT,
                    FIELD_INPUT_TRANSPARENT,
                    FIELD_TEXT,
                    FIELD_PADDING,
                    "selection:bg-primary/25 resize-none overflow-x-auto whitespace-pre",
                )}
            />
        </div>
    );
}
