import { describe, expect, test } from "bun:test";

import { WORKSPACE_NAME_LENGTH } from "@/modules/mock-server/domain/constants";
import {
    checkWorkspaceName,
    normalizeWorkspaceName,
} from "@/modules/mock-server/domain/workspace-name";

describe("normalizeWorkspaceName", () => {
    test("trims the ends", () => {
        expect(normalizeWorkspaceName("  Payments  ")).toBe("Payments");
    });

    test("collapses a run of spaces", () => {
        expect(normalizeWorkspaceName("Payments    API")).toBe("Payments API");
    });

    /** A paste out of a document is what actually brings these in. */
    test("collapses tabs and newlines into single spaces", () => {
        expect(normalizeWorkspaceName("Payments\t\nAPI")).toBe("Payments API");
    });

    test("leaves an already-clean name alone", () => {
        expect(normalizeWorkspaceName("Payments API")).toBe("Payments API");
    });

    test("reduces whitespace-only input to nothing", () => {
        expect(normalizeWorkspaceName(" \t\n ")).toBe("");
    });
});

describe("checkWorkspaceName", () => {
    test("accepts an ordinary name", () => {
        expect(checkWorkspaceName("Payments API")).toEqual({ ok: true, name: "Payments API" });
    });

    test("returns the normalised form, not what was typed", () => {
        expect(checkWorkspaceName("  Payments   API ")).toEqual({
            ok: true,
            name: "Payments API",
        });
    });

    test("accepts a name at the maximum length", () => {
        const name = "x".repeat(WORKSPACE_NAME_LENGTH.max);

        expect(checkWorkspaceName(name)).toEqual({ ok: true, name });
    });

    test("refuses one character past the maximum", () => {
        expect(checkWorkspaceName("x".repeat(WORKSPACE_NAME_LENGTH.max + 1))).toEqual({
            ok: false,
            reason: "invalid_name",
        });
    });

    test("refuses the empty string", () => {
        expect(checkWorkspaceName("")).toEqual({ ok: false, reason: "invalid_name" });
    });

    test("refuses whitespace alone", () => {
        expect(checkWorkspaceName("   ")).toEqual({ ok: false, reason: "invalid_name" });
    });

    test("accepts a single character", () => {
        expect(checkWorkspaceName("A")).toEqual({ ok: true, name: "A" });
    });

    test("accepts a Bangla name", () => {
        expect(checkWorkspaceName("পেমেন্ট এপিআই")).toEqual({
            ok: true,
            name: "পেমেন্ট এপিআই",
        });
    });

    /**
     * Counted in code points. An emoji is two UTF-16 units, so a `.length`
     * check would refuse a name half the visible size of the ceiling.
     */
    test("counts astral characters once each", () => {
        const name = "🚀".repeat(WORKSPACE_NAME_LENGTH.max);

        expect(checkWorkspaceName(name)).toEqual({ ok: true, name });
    });

    test("refuses one astral character past the maximum", () => {
        expect(checkWorkspaceName("🚀".repeat(WORKSPACE_NAME_LENGTH.max + 1))).toEqual({
            ok: false,
            reason: "invalid_name",
        });
    });
});
