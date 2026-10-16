import { describe, expect, test } from "bun:test";

import { MAX_PAUSES } from "@/modules/text-to-speech/domain/constants";
import {
    formatPauseMarker,
    insertPauseMarker,
    parseScript,
} from "@/modules/text-to-speech/domain/script";

describe("pause markers", () => {
    test("text with no markers is one run", () => {
        expect(parseScript("Hello there.")).toEqual([{ kind: "text", text: "Hello there." }]);
    });

    test("a marker splits the text around it", () => {
        expect(parseScript("One. [pause 2s] Two.")).toEqual([
            { kind: "text", text: "One. " },
            { kind: "pause", seconds: 2 },
            { kind: "text", text: " Two." },
        ]);
    });

    test("is lenient about case, spacing and a missing unit", () => {
        for (const marker of ["[Pause 1.5s]", "[ pause 1.5 s ]", "[PAUSE 1.5]"]) {
            expect(parseScript(marker)).toEqual([{ kind: "pause", seconds: 1.5 }]);
        }
    });

    test("leaves anything that is not quite a marker as text, to be read aloud", () => {
        for (const text of ["[pause]", "[pause -2s]", "[pause 2ms]", "[pause 1e3s]", "pause 2s"]) {
            expect(parseScript(text)).toEqual([{ kind: "text", text }]);
        }
    });

    test("refuses a pause outside the range, pointing at the marker in characters", () => {
        // The emoji is two UTF-16 units and one character; the position counts characters.
        expect(parseScript("😀 ok [pause 30s]")).toEqual({
            ok: false,
            reason: "pause_out_of_range",
            position: 6,
        });
        expect(parseScript("[pause 0.05s]")).toMatchObject({ reason: "pause_out_of_range" });
    });

    test("refuses more markers than the ceiling", () => {
        const text = "a [pause 1s] ".repeat(MAX_PAUSES + 1);

        expect(parseScript(text)).toMatchObject({ ok: false, reason: "too_many_pauses" });
        expect(Array.isArray(parseScript("a [pause 1s] ".repeat(MAX_PAUSES)))).toBe(true);
    });

    test("the menu's marker parses back to its own value", () => {
        expect(parseScript(formatPauseMarker(0.5))).toEqual([{ kind: "pause", seconds: 0.5 }]);
    });
});

describe("inserting a marker at the caret", () => {
    test("adds a space only on a side that lacks one", () => {
        expect(insertPauseMarker("Hello world", 5, 5, 1)).toEqual({
            text: "Hello [pause 1s] world",
            caret: 16,
        });
        expect(insertPauseMarker("Hello ", 6, 6, 2)).toEqual({
            text: "Hello [pause 2s]",
            caret: 16,
        });
        expect(insertPauseMarker("", 0, 0, 3)).toEqual({ text: "[pause 3s]", caret: 10 });
    });

    test("replaces a selection", () => {
        expect(insertPauseMarker("one XX two", 4, 6, 1).text).toBe("one [pause 1s] two");
    });

    test("clamps a caret the box no longer has", () => {
        expect(insertPauseMarker("abc", 99, 120, 1).text).toBe("abc [pause 1s]");
    });
});
