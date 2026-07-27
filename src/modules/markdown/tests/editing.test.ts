import { describe, expect, test } from "bun:test";

import {
    applyEditAction,
    DEFAULT_EDITOR_PLACEHOLDERS,
    type EditorPlaceholders,
} from "@/modules/markdown/domain/editing";
import type { EditorSelection, MarkdownEditAction } from "@/modules/markdown/types";

const PLACEHOLDERS: EditorPlaceholders = {
    ...DEFAULT_EDITOR_PLACEHOLDERS,
    linkUrl: "https://",
    imageUrl: "https://",
};

/**
 * Writes the caret into the string so an expectation reads as what the editor
 * looks like afterwards. `|` is an empty caret; `[…]` is a selection.
 */
function render(selection: EditorSelection): string {
    const { text, selectionStart, selectionEnd } = selection;

    if (selectionStart === selectionEnd) {
        return `${text.slice(0, selectionStart)}|${text.slice(selectionStart)}`;
    }

    return `${text.slice(0, selectionStart)}[${text.slice(selectionStart, selectionEnd)}]${text.slice(selectionEnd)}`;
}

function at(text: string, start: number, end = start): EditorSelection {
    return { text, selectionStart: start, selectionEnd: end };
}

function apply(action: MarkdownEditAction, selection: EditorSelection): string {
    return render(applyEditAction(action, selection, PLACEHOLDERS));
}

describe("applyEditAction — wrapping", () => {
    test("wraps the selection and keeps it selected", () => {
        expect(apply("bold", at("make this loud", 5, 9))).toBe("make **[this]** loud");
    });

    test("inserts the markers with the caret between them when nothing is selected", () => {
        expect(apply("italic", at("ab", 1))).toBe("a_|_b");
    });

    test("unwraps when the markers are inside the selection", () => {
        expect(apply("bold", at("a **b** c", 2, 7))).toBe("a [b] c");
    });

    test("unwraps when the markers surround the selection", () => {
        expect(apply("bold", at("a **b** c", 4, 5))).toBe("a [b] c");
    });

    test("uses an underscore for italics, which GFM will not apply intraword", () => {
        expect(apply("italic", at("word", 0, 4))).toBe("_[word]_");
    });

    test("wraps code in a single backtick and strikethrough in two tildes", () => {
        expect(apply("inlineCode", at("x", 0, 1))).toBe("`[x]`");
        expect(apply("strikethrough", at("x", 0, 1))).toBe("~~[x]~~");
    });
});

describe("applyEditAction — line prefixes", () => {
    test("prefixes the line the caret sits on, not just from the caret", () => {
        expect(apply("quote", at("hello world", 6))).toBe("[> hello world]");
    });

    test("prefixes every line the selection touches", () => {
        expect(apply("bulletList", at("one\ntwo\nthree", 1, 9))).toBe("[- one\n- two\n- three]");
    });

    test("removes the prefix when every line already has it", () => {
        expect(apply("bulletList", at("- one\n- two", 0, 11))).toBe("[one\ntwo]");
    });

    test("adds the prefix when only some lines have it", () => {
        expect(apply("bulletList", at("- one\ntwo", 0, 9))).toBe("[- - one\n- two]");
    });

    test("replaces a heading marker instead of stacking a second one", () => {
        expect(apply("heading3", at("# Title", 0))).toBe("[### Title]");
    });

    test("toggles a heading off at the same level", () => {
        expect(apply("heading2", at("## Title", 0))).toBe("[Title]");
    });

    test("writes an unchecked box for a task item", () => {
        expect(apply("taskList", at("ship it", 0))).toBe("[- [ ] ship it]");
    });

    test("does not drag in the line after a selection that ends on a break", () => {
        expect(apply("quote", at("one\ntwo", 0, 4))).toBe("[> one]\ntwo");
    });
});

describe("applyEditAction — ordered list", () => {
    test("numbers the selected lines from one", () => {
        expect(apply("orderedList", at("a\nb\nc", 0, 5))).toBe("[1. a\n2. b\n3. c]");
    });

    test("strips the numbering when every line already carries it", () => {
        expect(apply("orderedList", at("1. a\n2. b", 0, 9))).toBe("[a\nb]");
    });
});

describe("applyEditAction — insertions", () => {
    test("uses the selection as the link label and selects the URL", () => {
        expect(apply("link", at("read the docs", 9, 13))).toBe("read the [docs]([https://])");
    });

    test("falls back to the placeholder label when nothing is selected", () => {
        expect(apply("link", at("", 0))).toBe("[text]([https://])");
    });

    test("writes an image with its bang and selects the URL", () => {
        expect(apply("image", at("", 0))).toBe("![alt]([https://])");
    });

    test("opens a fenced block with the caret on the language", () => {
        expect(apply("codeBlock", at("", 0))).toBe("```|\n\n```\n");
    });

    test("wraps the selection in the fence", () => {
        expect(applyEditAction("codeBlock", at("const a = 1", 0, 11), PLACEHOLDERS).text).toBe(
            "```\nconst a = 1\n```\n",
        );
    });

    test("starts a block on its own line rather than mid-sentence", () => {
        expect(applyEditAction("rule", at("text", 4), PLACEHOLDERS).text).toBe("text\n\n---\n");
    });

    test("does not stack blank lines when one is already there", () => {
        expect(applyEditAction("rule", at("text\n\n", 6), PLACEHOLDERS).text).toBe("text\n\n---\n");
    });

    test("writes a table skeleton with a separator row", () => {
        expect(applyEditAction("table", at("", 0), PLACEHOLDERS).text).toBe(
            "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |\n",
        );
    });

    test("uses the placeholders it is given, so the UI can localise them", () => {
        const bangla: EditorPlaceholders = {
            ...DEFAULT_EDITOR_PLACEHOLDERS,
            linkLabel: "লেখা",
            linkUrl: "ঠিকানা",
        };

        expect(applyEditAction("link", at("", 0), bangla).text).toBe("[লেখা](ঠিকানা)");
    });
});

describe("applyEditAction — purity", () => {
    test("never mutates the selection it was given", () => {
        const original = at("hello", 0, 5);

        applyEditAction("bold", original, PLACEHOLDERS);

        expect(original).toEqual({ text: "hello", selectionStart: 0, selectionEnd: 5 });
    });
});
