import { describe, expect, test } from "bun:test";

import {
    FLAG_LETTERS,
    formatFlagLetters,
    hasFlag,
    parseFlagLetters,
    toEngineFlags,
    toggleFlag,
} from "@/modules/regex/domain/flags";
import { REGEX_FLAGS, type RegexFlag } from "@/modules/regex/types";

describe("flag letters", () => {
    test("every flag has a distinct letter", () => {
        const letters = REGEX_FLAGS.map((flag) => FLAG_LETTERS[flag]);

        expect(new Set(letters).size).toBe(REGEX_FLAGS.length);
    });

    test("formats in display order, not selection order", () => {
        expect(formatFlagLetters(["multiline", "global"])).toBe("gm");
        expect(formatFlagLetters(["sticky", "ungreedy", "global"])).toBe("gUy");
    });

    test("parses letters in any order and ignores unknown ones", () => {
        expect(parseFlagLetters("mg")).toEqual(["global", "multiline"]);
        expect(parseFlagLetters("gQz")).toEqual(["global"]);
        expect(parseFlagLetters("")).toEqual([]);
    });

    test("round-trips through letters", () => {
        for (const flag of REGEX_FLAGS) {
            expect(parseFlagLetters(formatFlagLetters([flag]))).toEqual([flag]);
        }
    });

    test("U and x are display-only; the engine never sees them", () => {
        expect(toEngineFlags(["ungreedy", "extended"])).toBe("d");
        expect(toEngineFlags(["global", "extended", "multiline"])).toBe("dgm");
    });

    test("indices are always compiled in, so captures can report positions", () => {
        expect(toEngineFlags([])).toBe("d");
        expect(new RegExp("a", toEngineFlags(["global"])).hasIndices).toBe(true);
    });

    test("every engine flag string is accepted by RegExp", () => {
        const all: readonly RegexFlag[] = REGEX_FLAGS.filter((flag) => flag !== "sticky");

        expect(() => new RegExp("a", toEngineFlags(all))).not.toThrow();
    });

    test("toggle adds, removes, and keeps canonical order", () => {
        expect(toggleFlag([], "global")).toEqual(["global"]);
        expect(toggleFlag(["global"], "global")).toEqual([]);
        expect(toggleFlag(["sticky"], "global")).toEqual(["global", "sticky"]);
    });

    test("hasFlag reads membership", () => {
        expect(hasFlag(["global", "dotAll"], "dotAll")).toBe(true);
        expect(hasFlag(["global"], "dotAll")).toBe(false);
    });
});
