import { describe, expect, test } from "bun:test";

import {
    INSPECTOR_SHORTCUT,
    isTypingTarget,
    PALETTE_SHORTCUT,
    TYPING_TAG_NAMES,
} from "@/modules/mock-server/domain/keyboard";

describe("isTypingTarget", () => {
    /**
     * The bug this guard exists to prevent: `Delete` pressed with the cursor in
     * the inspector's name field deleting the node instead of a character, and
     * `[` typed into a path becoming a command instead of a bracket.
     */
    test("every text-taking element is one", () => {
        for (const tag of TYPING_TAG_NAMES) {
            expect(isTypingTarget(tag)).toBe(true);
        }
    });

    /** React gives `tagName` upper-cased, but nothing in the DOM promises it. */
    test("is not fooled by case", () => {
        expect(isTypingTarget("input")).toBe(true);
        expect(isTypingTarget("TeXtArEa")).toBe(true);
    });

    /**
     * A `<select>` takes no text and still counts: letter keys jump to an
     * option, and the faker picker has fifty-one of them.
     */
    test("a select counts", () => {
        expect(isTypingTarget("SELECT")).toBe(true);
    });

    test("a contenteditable counts whatever it is", () => {
        expect(isTypingTarget("DIV", true)).toBe(true);
        expect(isTypingTarget(null, true)).toBe(true);
    });

    test("ordinary elements do not", () => {
        expect(isTypingTarget("DIV")).toBe(false);
        expect(isTypingTarget("BUTTON")).toBe(false);
        expect(isTypingTarget("BODY")).toBe(false);
    });

    /** An event can arrive with no target at all; refusing to guard is wrong. */
    test("no target is not a typing target", () => {
        expect(isTypingTarget(null)).toBe(false);
        expect(isTypingTarget(null, false)).toBe(false);
    });
});

describe("panel shortcuts", () => {
    test("the two are different keys", () => {
        expect(PALETTE_SHORTCUT).not.toBe(INSPECTOR_SHORTCUT);
    });

    /**
     * Single characters, because the handler compares `event.key` directly. A
     * two-character value here would silently never match.
     */
    test("each is one character", () => {
        expect(PALETTE_SHORTCUT).toHaveLength(1);
        expect(INSPECTOR_SHORTCUT).toHaveLength(1);
    });

    /** The mnemonic: each bracket points at the rail it opens. */
    test("brackets, left and right in that order", () => {
        expect(PALETTE_SHORTCUT).toBe("[");
        expect(INSPECTOR_SHORTCUT).toBe("]");
    });
});
