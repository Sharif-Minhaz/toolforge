import { describe, expect, test } from "bun:test";

import { getByteLength } from "@/modules/tools/domain/byte-size";

import {
    chunkSpeechText,
    escapeSpeechText,
    removeUnspeakableCharacters,
} from "@/modules/text-to-speech/domain/chunks";
import { MAX_SPEECH_CHARACTERS } from "@/modules/text-to-speech/domain/constants";
import { planSpeech } from "@/modules/text-to-speech/domain/plan";

describe("cutting text into requests", () => {
    test("text under the budget is one piece, trimmed", () => {
        expect(chunkSpeechText("  Hello there.  ", 100)).toEqual(["Hello there."]);
    });

    test("prefers a line break, then a full stop, then a space", () => {
        expect(chunkSpeechText("First line\nSecond. Third part here", 30)).toEqual([
            "First line",
            "Second. Third part here",
        ]);
        expect(chunkSpeechText("One two. Three four five", 20)).toEqual([
            "One two.",
            "Three four five",
        ]);
        expect(chunkSpeechText("alpha beta gamma delta", 12)).toEqual([
            "alpha beta",
            "gamma delta",
        ]);
    });

    test("recognises the Bangla dari as the end of a sentence", () => {
        expect(chunkSpeechText("আমি ভালো আছি। তুমি কেমন আছ", 45)).toEqual([
            "আমি ভালো আছি।",
            "তুমি কেমন আছ",
        ]);
    });

    test("measures the escaped size, which is what is sent", () => {
        // Eight ampersands are eight characters but forty bytes once escaped.
        const pieces = chunkSpeechText("&&&& &&&&", 25);

        expect(pieces).toEqual(["&&&&", "&&&&"]);

        for (const piece of pieces) {
            expect(getByteLength(escapeSpeechText(piece))).toBeLessThanOrEqual(25);
        }
    });

    test("never splits a grapheme, even with nowhere better to cut", () => {
        // `ক্ষ` is three code points and nine bytes; a cut inside it would
        // leave a dangling virama.
        const pieces = chunkSpeechText("ক্ষক্ষক্ষক্ষ", 20);

        expect(pieces).toEqual(["ক্ষক্ষ", "ক্ষক্ষ"]);
    });

    test("drops pieces that are only whitespace", () => {
        expect(chunkSpeechText("   \n  ", 10)).toEqual([]);
    });

    test("control characters become spaces; tab and line breaks survive", () => {
        expect(removeUnspeakableCharacters("a\u0000b\u000cc\td\ne\rf\u007fg")).toBe(
            "a b c\td\ne\rf g",
        );
    });
});

describe("planning a generation", () => {
    test("text and pauses become steps in order", () => {
        expect(planSpeech("Hello. [pause 2s] Bye.")).toEqual({
            ok: true,
            steps: [
                { kind: "speak", text: "Hello." },
                { kind: "pause", seconds: 2 },
                { kind: "speak", text: "Bye." },
            ],
            spokenCharacters: 10,
            pauseSeconds: 2,
        });
    });

    test("blank text, and pauses with nothing to say, are empty", () => {
        expect(planSpeech("")).toEqual({ ok: false, reason: "empty" });
        expect(planSpeech("  \n ")).toEqual({ ok: false, reason: "empty" });
        expect(planSpeech("[pause 1s] [pause 2s]")).toEqual({ ok: false, reason: "empty" });
    });

    test("the ceiling counts everything in the box, markers included", () => {
        expect(planSpeech("a".repeat(MAX_SPEECH_CHARACTERS)).ok).toBe(true);
        expect(planSpeech("a".repeat(MAX_SPEECH_CHARACTERS + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("a marker failure keeps its own reason", () => {
        expect(planSpeech("Hi [pause 11s]")).toMatchObject({
            ok: false,
            reason: "pause_out_of_range",
        });
    });
});
