import { describe, expect, test } from "bun:test";

import {
    applyTypingValue,
    countTyping,
    createTypingRun,
    drawTypingWords,
    finishTyping,
    isOnTrack,
    scoreWord,
    summarizeTyping,
    wordsForDuration,
} from "@/modules/keyboard-tester/domain/typing";
import { typingWords } from "@/modules/keyboard-tester/domain/typing-words";
import type { TypingRun } from "@/modules/keyboard-tester/types";

const MINUTE = 60_000;

/** Types `text` one character at a time, `gap` ms apart, starting at `start`. */
function typeOut(run: TypingRun, text: string, start = 1000, gap = 100): TypingRun {
    let next = run;
    let value = next.current;

    [...text].forEach((character, index) => {
        value += character;
        next = applyTypingValue(next, value, start + index * gap, MINUTE);
        value = next.current;
    });

    return next;
}

/** A counter source: byte `n` of every draw is the draw number, so picks cycle. */
function sequenceBytes(): (length: number) => Uint8Array {
    let draw = 0;

    return (length) => {
        const bytes = new Uint8Array(length);
        bytes[length - 1] = draw % 256;
        draw += 1;

        return bytes;
    };
}

describe("scoreWord", () => {
    test("an exact word", () => {
        expect(scoreWord("hello", "hello")).toEqual({
            correct: 5,
            incorrect: 0,
            extra: 0,
            missed: 0,
            exact: true,
        });
    });

    test("a wrong letter, a short word and a long word", () => {
        expect(scoreWord("hello", "hallo")).toMatchObject({
            correct: 4,
            incorrect: 1,
            exact: false,
        });
        expect(scoreWord("hello", "hel")).toMatchObject({ correct: 3, missed: 2, exact: false });
        expect(scoreWord("hello", "helloo")).toMatchObject({ correct: 5, extra: 1, exact: false });
    });

    test("both spellings of য় match, whichever the keyboard sent", () => {
        const precomposed = "\u09B8\u09AE\u09DF";
        const decomposed = "\u09B8\u09AE\u09AF\u09BC";

        expect(scoreWord(decomposed, precomposed).exact).toBe(true);
        expect(scoreWord(precomposed, decomposed).exact).toBe(true);
    });
});

describe("applyTypingValue", () => {
    test("the clock starts on the first character, not before", () => {
        const run = createTypingRun(["one", "two"]);

        expect(applyTypingValue(run, " ", 500, MINUTE)).toBe(run);
        expect(applyTypingValue(run, "o", 800, MINUTE).startedAt).toBe(800);
    });

    test("a space commits the word under the caret", () => {
        const run = typeOut(createTypingRun(["one", "two", "three"]), "one tw");

        expect(run.typed).toEqual(["one"]);
        expect(run.current).toBe("tw");
    });

    test("a double space does not commit an empty word", () => {
        const run = typeOut(createTypingRun(["one", "two", "three"]), "one  two");

        expect(run.typed).toEqual(["one"]);
        expect(run.current).toBe("two");
    });

    test("deleting counts corrections, and a committed word stays committed", () => {
        let run = typeOut(createTypingRun(["one", "two"]), "one tx");
        run = applyTypingValue(run, "t", 2000, MINUTE);
        run = applyTypingValue(run, "", 2100, MINUTE);
        run = applyTypingValue(run, "", 2200, MINUTE);

        expect(run.corrections).toBe(2);
        expect(run.typed).toEqual(["one"]);
    });

    test("committing the last word ends the run early", () => {
        const run = typeOut(createTypingRun(["a", "b"]), "a b ");

        expect(run.typed).toEqual(["a", "b"]);
        expect(run.endedAt).not.toBeNull();
    });

    test("a pasted sentence commits every word in it, up to the list", () => {
        const run = applyTypingValue(createTypingRun(["a", "b", "c"]), "a b c d e", 0, MINUTE);

        expect(run.typed).toEqual(["a", "b", "c"]);
        expect(run.current).toBe("");
    });

    test("nothing is accepted after the clock runs out", () => {
        let run = typeOut(createTypingRun(["one", "two"]), "on", 0, 100);
        run = applyTypingValue(run, "one", MINUTE + 5, MINUTE);

        expect(run.endedAt).toBe(MINUTE);
        expect(run.current).toBe("on");
        expect(applyTypingValue(run, "one ", MINUTE + 10, MINUTE)).toBe(run);
    });

    test("finishTyping clamps to the duration and is idempotent", () => {
        const run = typeOut(createTypingRun(["one"]), "o", 0);
        const finished = finishTyping(run, MINUTE * 2, MINUTE);

        expect(finished.endedAt).toBe(MINUTE);
        expect(finishTyping(finished, MINUTE * 3, MINUTE)).toBe(finished);
        expect(finishTyping(createTypingRun(["one"]), 5, MINUTE).endedAt).toBeNull();
    });
});

describe("countTyping and summarizeTyping", () => {
    test("net speed counts correct words and their spaces; raw counts everything", () => {
        // "hello" right, "word" wrong, "again" half typed and on track.
        let run = createTypingRun(["hello", "world", "again"]);
        run = applyTypingValue(run, "hello ", 0, MINUTE);
        run = applyTypingValue(run, "wrld ", 1000, MINUTE);
        run = applyTypingValue(run, "ag", 2000, MINUTE);

        const counts = countTyping(run);

        expect(counts.correctWords).toBe(1);
        expect(counts.incorrectWords).toBe(1);
        expect(counts.netChars).toBe(6 + 2);
        expect(counts.rawChars).toBe(6 + 5 + 2);
    });

    test("an off-track partial word earns no net speed", () => {
        let run = createTypingRun(["hello"]);
        run = applyTypingValue(run, "hx", 0, MINUTE);

        expect(countTyping(run).netChars).toBe(0);
    });

    test("words per minute: 300 correct characters in one minute is 60 wpm", () => {
        // 50 five-letter words and their spaces = 300 characters.
        const words = Array.from({ length: 60 }, () => "abcde");
        let run = createTypingRun(words);

        for (let index = 0; index < 50; index += 1) {
            run = applyTypingValue(run, "abcde ", index * 1000, MINUTE);
        }

        const summary = summarizeTyping(finishTyping(run, MINUTE, MINUTE), MINUTE, MINUTE);

        expect(summary.elapsedMs).toBe(MINUTE);
        expect(summary.wpm).toBeCloseTo(60, 10);
        expect(summary.rawWpm).toBeCloseTo(60, 10);
        expect(summary.accuracy).toBe(1);
    });

    test("accuracy counts missed and extra characters against the typist", () => {
        let run = createTypingRun(["hello", "world"]);
        run = applyTypingValue(run, "hel ", 0, MINUTE);
        run = applyTypingValue(run, "worldd ", 500, MINUTE);

        const summary = summarizeTyping(run, 1000, MINUTE);

        // 3 + 5 correct, 2 missed, 1 extra.
        expect(summary.accuracy).toBeCloseTo(8 / 11, 10);
    });

    test("speed is reported per elapsed second, and consistency needs three", () => {
        let run = createTypingRun(Array.from({ length: 40 }, () => "ab"));
        // The first letter starts the clock at 0; then one word every 500 ms,
        // off the second boundaries, so every second holds exactly two.
        run = applyTypingValue(run, "a", 0, MINUTE);
        run = applyTypingValue(run, "ab ", 250, MINUTE);

        for (let index = 1; index < 9; index += 1) {
            run = applyTypingValue(run, "ab ", 250 + index * 500, MINUTE);
        }

        const summary = summarizeTyping(run, 4500, MINUTE);

        expect(summary.perSecond).toHaveLength(4);
        expect(summary.consistency).toBeCloseTo(1, 10);
        expect(summarizeTyping(run, 2500, MINUTE).consistency).toBeNull();
    });

    test("an untouched run reads zero, not NaN", () => {
        const summary = summarizeTyping(createTypingRun(["a"]), 1000, MINUTE);

        expect(summary).toMatchObject({ wpm: 0, rawWpm: 0, accuracy: 0, elapsedMs: 0 });
    });
});

describe("word lists", () => {
    test("both lists are lower-case single words with no duplicates", () => {
        for (const language of ["english", "bangla"] as const) {
            const words = typingWords(language);

            expect(new Set(words).size).toBe(words.length);
            expect(words.every((word) => !/\s/u.test(word) && word === word.toLowerCase())).toBe(
                true,
            );
            expect(words.every((word) => word === word.normalize("NFC"))).toBe(true);
        }
    });

    test("draws never repeat a word twice in a row", () => {
        const words = drawTypingWords("english", 500, sequenceBytes());

        expect(words).toHaveLength(500);
        expect(words.every((word, index) => word !== words[index - 1])).toBe(true);
    });

    test("there are enough words for 240 words a minute", () => {
        expect(wordsForDuration(60)).toBeGreaterThanOrEqual(240);
    });

    test("isOnTrack compares after normalisation", () => {
        expect(isOnTrack("\u09B8\u09AE\u09AF\u09BC", "\u09B8\u09AE\u09DF")).toBe(true);
        expect(isOnTrack("hello", "hex")).toBe(false);
    });
});
