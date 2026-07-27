import type { EditorSelection, MarkdownEditAction } from "../types";

/**
 * The words a toolbar button leaves behind when there is nothing selected.
 * Passed in rather than hard-coded so the UI can hand over localised copy and
 * the domain layer stays free of `next-intl`.
 */
export type EditorPlaceholders = {
    readonly linkLabel: string;
    readonly linkUrl: string;
    readonly imageAlt: string;
    readonly imageUrl: string;
    readonly tableHeader: string;
    readonly tableCell: string;
};

export const DEFAULT_EDITOR_PLACEHOLDERS: EditorPlaceholders = {
    linkLabel: "text",
    linkUrl: "https://",
    imageAlt: "alt",
    imageUrl: "https://",
    tableHeader: "Column",
    tableCell: "Cell",
};

const WRAPPERS: Partial<Record<MarkdownEditAction, string>> = {
    bold: "**",
    // `_` over `*`, because GFM refuses intraword `_` — so wrapping part of a
    // word cannot silently italicise the rest of the paragraph.
    italic: "_",
    strikethrough: "~~",
    inlineCode: "`",
};

const LINE_PREFIXES: Partial<Record<MarkdownEditAction, string>> = {
    heading1: "# ",
    heading2: "## ",
    heading3: "### ",
    quote: "> ",
    bulletList: "- ",
    taskList: "- [ ] ",
};

const ANY_HEADING = /^#{1,6} /;

const ANY_ORDERED = /^\d+\. /;

/* ------------------------------------------------------------------- wrap --- */

function toggleWrap(marker: string, selection: EditorSelection): EditorSelection {
    const { text, selectionStart, selectionEnd } = selection;
    const before = text.slice(0, selectionStart);
    const selected = text.slice(selectionStart, selectionEnd);
    const after = text.slice(selectionEnd);
    const span = marker.length * 2;

    // Markers inside the selection: the user selected `**bold**` including them.
    if (selected.length >= span && selected.startsWith(marker) && selected.endsWith(marker)) {
        const inner = selected.slice(marker.length, selected.length - marker.length);

        return {
            text: before + inner + after,
            selectionStart,
            selectionEnd: selectionStart + inner.length,
        };
    }

    // Markers around the selection: the user selected only the words between them.
    if (before.endsWith(marker) && after.startsWith(marker)) {
        const start = selectionStart - marker.length;

        return {
            text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
            selectionStart: start,
            selectionEnd: start + selected.length,
        };
    }

    return {
        text: `${before}${marker}${selected}${marker}${after}`,
        selectionStart: selectionStart + marker.length,
        selectionEnd: selectionStart + marker.length + selected.length,
    };
}

/* ------------------------------------------------------------------ lines --- */

type LineSpan = {
    readonly start: number;
    readonly end: number;
    readonly lines: readonly string[];
};

/**
 * Grows the selection out to whole lines, which is what a prefix acts on. A
 * selection that ends exactly on a line break does not drag the next line in —
 * otherwise selecting one paragraph would bullet the one after it.
 */
function selectedLines(selection: EditorSelection): LineSpan {
    const { text, selectionStart, selectionEnd } = selection;
    const start = text.lastIndexOf("\n", selectionStart - 1) + 1;
    const trailing =
        selectionEnd > selectionStart && text[selectionEnd - 1] === "\n"
            ? selectionEnd - 1
            : selectionEnd;
    const break_ = text.indexOf("\n", trailing);
    const end = break_ === -1 ? text.length : break_;

    return { start, end, lines: text.slice(start, end).split("\n") };
}

function replaceLines(
    selection: EditorSelection,
    span: LineSpan,
    lines: readonly string[],
): EditorSelection {
    const replacement = lines.join("\n");

    return {
        text: selection.text.slice(0, span.start) + replacement + selection.text.slice(span.end),
        selectionStart: span.start,
        selectionEnd: span.start + replacement.length,
    };
}

function toggleLinePrefix(prefix: string, selection: EditorSelection): EditorSelection {
    const span = selectedLines(selection);
    const heading = ANY_HEADING.test(prefix);
    const applied = span.lines.every((line) => line.startsWith(prefix));

    const lines = span.lines.map((line) => {
        if (applied) {
            return line.slice(prefix.length);
        }

        // Switching between heading levels replaces the marker rather than
        // stacking a second one on top of it.
        const stripped = heading ? line.replace(ANY_HEADING, "") : line;

        return prefix + stripped;
    });

    return replaceLines(selection, span, lines);
}

function toggleOrderedList(selection: EditorSelection): EditorSelection {
    const span = selectedLines(selection);
    const applied = span.lines.every((line) => ANY_ORDERED.test(line));

    const lines = span.lines.map((line, index) =>
        applied ? line.replace(ANY_ORDERED, "") : `${index + 1}. ${line}`,
    );

    return replaceLines(selection, span, lines);
}

/* ----------------------------------------------------------------- insert --- */

/**
 * Replaces the selection with `snippet`, then selects the run of characters at
 * `highlight` inside it — so the caret lands on the URL placeholder rather than
 * at the end of the line, ready to be typed over.
 */
function insert(
    selection: EditorSelection,
    snippet: string,
    highlight: { readonly offset: number; readonly length: number },
): EditorSelection {
    const { text, selectionStart, selectionEnd } = selection;
    const start = selectionStart + highlight.offset;

    return {
        text: text.slice(0, selectionStart) + snippet + text.slice(selectionEnd),
        selectionStart: start,
        selectionEnd: start + highlight.length,
    };
}

/** Guarantees the snippet begins its own block, without stacking blank lines. */
function asBlock(selection: EditorSelection, snippet: string) {
    const before = selection.text.slice(0, selection.selectionStart);
    const after = selection.text.slice(selection.selectionEnd);
    const lead =
        before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const tail = after.startsWith("\n") ? "" : "\n";

    return { snippet: `${lead}${snippet}${tail}`, offset: lead.length };
}

function buildTable(placeholders: EditorPlaceholders): string {
    const { tableHeader, tableCell } = placeholders;

    return [
        `| ${tableHeader} 1 | ${tableHeader} 2 |`,
        "| --- | --- |",
        `| ${tableCell} | ${tableCell} |`,
        `| ${tableCell} | ${tableCell} |`,
    ].join("\n");
}

/* ------------------------------------------------------------------ entry --- */

/**
 * One toolbar button, applied to the textarea's value and caret.
 *
 * Pure: it takes the text and the selection and returns the next text and the
 * next selection. The component's only job is to write both back, which is what
 * keeps every button testable without a DOM.
 */
export function applyEditAction(
    action: MarkdownEditAction,
    selection: EditorSelection,
    placeholders: EditorPlaceholders = DEFAULT_EDITOR_PLACEHOLDERS,
): EditorSelection {
    const wrapper = WRAPPERS[action];

    if (wrapper !== undefined) {
        return toggleWrap(wrapper, selection);
    }

    const prefix = LINE_PREFIXES[action];

    if (prefix !== undefined) {
        return toggleLinePrefix(prefix, selection);
    }

    const selected = selection.text.slice(selection.selectionStart, selection.selectionEnd);

    switch (action) {
        case "orderedList":
            return toggleOrderedList(selection);
        case "link": {
            const label = selected || placeholders.linkLabel;
            const snippet = `[${label}](${placeholders.linkUrl})`;

            return insert(selection, snippet, {
                offset: label.length + 3,
                length: placeholders.linkUrl.length,
            });
        }
        case "image": {
            const alt = selected || placeholders.imageAlt;
            const snippet = `![${alt}](${placeholders.imageUrl})`;

            return insert(selection, snippet, {
                offset: alt.length + 4,
                length: placeholders.imageUrl.length,
            });
        }
        case "codeBlock": {
            const { snippet, offset } = asBlock(selection, `\`\`\`\n${selected}\n\`\`\``);

            // Caret on the empty infostring, where the language goes.
            return insert(selection, snippet, { offset: offset + 3, length: 0 });
        }
        case "table": {
            const { snippet, offset } = asBlock(selection, buildTable(placeholders));

            return insert(selection, snippet, { offset, length: snippet.trim().length });
        }
        case "rule": {
            const { snippet, offset } = asBlock(selection, "---");

            return insert(selection, snippet, { offset, length: 3 });
        }
        default:
            return selection;
    }
}
