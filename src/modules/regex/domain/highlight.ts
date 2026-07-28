import type { HighlightKind, HighlightSpan, RegexNode } from "../types";

/**
 * Turns the parse tree into a flat, gap-free run of coloured spans.
 *
 * "Gap-free" is the whole contract: the highlighted layer sits behind a
 * transparent input, so the two only stay aligned while the spans concatenate
 * back into exactly the original pattern. Every character the walk does not
 * claim is filled in as `plain` rather than dropped.
 */

const CONTAINER_KINDS = new Set<RegexNode["kind"]>([
    "captureGroup",
    "namedGroup",
    "nonCapturingGroup",
    "lookahead",
    "lookbehind",
    "atomicGroup",
    "modifierGroup",
]);

const ESCAPE_KINDS = new Set<RegexNode["kind"]>([
    "escapedLiteral",
    "shorthand",
    "unicodeProperty",
    "controlEscape",
    "hexEscape",
    "unicodeEscape",
    "dot",
]);

function push(spans: HighlightSpan[], start: number, end: number, kind: HighlightKind): void {
    if (end > start) {
        spans.push({ start, end, kind });
    }
}

function collect(node: RegexNode, spans: HighlightSpan[]): void {
    const children = node.children ?? [];

    switch (node.kind) {
        case "sequence": {
            for (const child of children) {
                collect(child, spans);
            }

            break;
        }

        case "alternation": {
            for (const [index, branch] of children.entries()) {
                // The `|` is exactly the gap between one branch and the next.
                if (index > 0) {
                    push(spans, children[index - 1].end, branch.start, "alternation");
                }

                collect(branch, spans);
            }

            break;
        }

        case "characterClass": {
            push(spans, node.start, node.start + (node.openLength ?? 1), "charClass");
            push(spans, node.end - (node.closeLength ?? 0), node.end, "charClass");

            for (const child of children) {
                collect(child, spans);
            }

            break;
        }

        case "classRange": {
            const [lower, upper] = children;

            if (lower !== undefined && upper !== undefined) {
                collect(lower, spans);
                push(spans, lower.end, upper.start, "charClass");
                collect(upper, spans);
            }

            break;
        }

        case "anchorStart":
        case "anchorEnd":
        case "wordBoundary": {
            push(spans, node.start, node.end, "anchor");

            break;
        }

        case "backreference":
        case "namedBackreference": {
            push(spans, node.start, node.end, "backreference");

            break;
        }

        case "comment":
        case "ignorableWhitespace": {
            push(spans, node.start, node.end, "comment");

            break;
        }

        case "recursion": {
            push(spans, node.start, node.end, "group");

            break;
        }

        default: {
            if (ESCAPE_KINDS.has(node.kind)) {
                push(spans, node.start, node.end, "escape");

                break;
            }

            if (CONTAINER_KINDS.has(node.kind)) {
                // An opaque form such as `(?i)` has no body; the whole span is
                // structure.
                if (children.length === 0) {
                    push(spans, node.start, node.end, "group");

                    break;
                }

                push(spans, node.start, node.start + (node.openLength ?? 1), "group");
                push(spans, node.end - (node.closeLength ?? 0), node.end, "group");

                for (const child of children) {
                    collect(child, spans);
                }
            }

            // `literal` and `unknown` fall through to the plain gap fill.
            break;
        }
    }

    if (node.quantifier !== undefined) {
        push(spans, node.quantifier.start, node.quantifier.end, "quantifier");
    }
}

/** Sorts, drops overlaps, and pads the result out to cover the whole string. */
function fillGaps(length: number, spans: readonly HighlightSpan[]): HighlightSpan[] {
    const ordered = [...spans].toSorted((a, b) => a.start - b.start || a.end - b.end);
    const filled: HighlightSpan[] = [];
    let cursor = 0;

    for (const span of ordered) {
        if (span.start < cursor) {
            continue;
        }

        if (span.start > cursor) {
            filled.push({ start: cursor, end: span.start, kind: "plain" });
        }

        filled.push(span);
        cursor = span.end;
    }

    if (cursor < length) {
        filled.push({ start: cursor, end: length, kind: "plain" });
    }

    return filled;
}

export function toHighlightSpans(pattern: string, root: RegexNode): readonly HighlightSpan[] {
    const spans: HighlightSpan[] = [];
    collect(root, spans);

    return fillGaps(pattern.length, spans);
}
