import { describe, expect, test } from "bun:test";

import {
    DEFAULT_SLUG_OPTIONS,
    MAX_SEPARATOR_LENGTH,
    MAX_SLUG_INPUT_LENGTH,
    SAFE_SEPARATOR_CHARACTERS,
    SEPARATOR_CHARACTERS,
} from "@/modules/slug/domain/constants";
import { resolveSeparator, slugify } from "@/modules/slug/domain/slugify";
import { isStopWord, STOP_WORDS } from "@/modules/slug/domain/stop-words";
import { applyTransliterations, TRANSLITERATIONS } from "@/modules/slug/domain/transliterate";
import type { SlugOptions, SlugSeparatorPreset, SlugSuccess } from "@/modules/slug/types";

function withOptions(patch: Partial<SlugOptions> = {}): SlugOptions {
    return { ...DEFAULT_SLUG_OPTIONS, ...patch };
}

/** Every assertion below is about the slug, so a failure here is a test bug. */
function expectSuccess(text: string, patch: Partial<SlugOptions> = {}): SlugSuccess {
    const result = slugify(text, withOptions(patch));

    if (!result.ok) {
        throw new Error(`expected a slug, got ${result.reason}`);
    }

    return result;
}

describe("slugify — the shape of a slug", () => {
    test("lowercases, folds spaces and drops punctuation", () => {
        expect(expectSuccess("How to Build a Modern Website!").slug).toBe(
            "how-to-build-a-modern-website",
        );
    });

    test("collapses runs of separators instead of repeating them", () => {
        expect(expectSuccess("  hello   ---  world  ").slug).toBe("hello-world");
    });

    test("never leaves a leading or trailing separator", () => {
        expect(expectSuccess("!!! edge case ???").slug).toBe("edge-case");
    });

    test("reports the character and word counts of what it produced", () => {
        const result = expectSuccess("Ten Little Words");

        expect(result.slug).toBe("ten-little-words");
        expect(result.length).toBe("ten-little-words".length);
        expect(result.words).toBe(3);
        expect(result.truncated).toBe(false);
    });

    test("returns an empty slug for empty or blank input rather than failing", () => {
        for (const blank of ["", "   ", "\n\t "]) {
            const result = expectSuccess(blank);

            expect(result.slug).toBe("");
            expect(result.words).toBe(0);
        }
    });

    test("fails when the options leave nothing to build a slug from", () => {
        expect(slugify("!!! ??? ---", withOptions())).toEqual({
            ok: false,
            reason: "empty_result",
        });
    });

    test("refuses an input longer than the ceiling", () => {
        expect(slugify("a".repeat(MAX_SLUG_INPUT_LENGTH + 1), withOptions())).toEqual({
            ok: false,
            reason: "too_long",
        });
        expect(slugify("a".repeat(MAX_SLUG_INPUT_LENGTH), withOptions()).ok).toBe(true);
    });
});

describe("slugify — separators", () => {
    const presets: readonly SlugSeparatorPreset[] = ["dash", "underscore", "dot", "tilde"];

    test("joins with the character each preset stands for", () => {
        for (const preset of presets) {
            const character = SEPARATOR_CHARACTERS[preset];

            expect(expectSuccess("one two three", { separator: preset }).slug).toBe(
                `one${character}two${character}three`,
            );
        }
    });

    test("accepts every unreserved mark as a typed separator", () => {
        for (const character of SAFE_SEPARATOR_CHARACTERS) {
            expect(
                expectSuccess("one two", { separator: "custom", customSeparator: character }).slug,
            ).toBe(`one${character}two`);
        }
    });

    test("accepts a short run of unreserved marks", () => {
        expect(expectSuccess("one two", { separator: "custom", customSeparator: "_-_" }).slug).toBe(
            "one_-_two",
        );
    });

    test("treats an empty typed separator as joining with nothing", () => {
        expect(
            expectSuccess("one two three", { separator: "custom", customSeparator: "" }).slug,
        ).toBe("onetwothree");
    });

    test("names the character it refused", () => {
        expect(
            slugify("one two", withOptions({ separator: "custom", customSeparator: "&" })),
        ).toEqual({ ok: false, reason: "unsafe_separator", character: "&" });
        expect(
            slugify("one two", withOptions({ separator: "custom", customSeparator: " " })),
        ).toEqual({ ok: false, reason: "unsafe_separator", character: " " });
        // The first offender is the one reported, even mid-string.
        expect(
            slugify("one two", withOptions({ separator: "custom", customSeparator: "-/-" })),
        ).toEqual({ ok: false, reason: "unsafe_separator", character: "/" });
    });

    test("refuses a typed separator longer than the ceiling", () => {
        expect(
            slugify(
                "one two",
                withOptions({
                    separator: "custom",
                    customSeparator: "-".repeat(MAX_SEPARATOR_LENGTH + 1),
                }),
            ),
        ).toEqual({ ok: false, reason: "separator_too_long" });
    });

    test("resolves a preset without consulting the custom field", () => {
        expect(resolveSeparator(withOptions({ separator: "dot", customSeparator: "&" }))).toEqual({
            ok: true,
            value: ".",
        });
    });

    test("a dot separator survives the word splitter that would also match it", () => {
        // `.` is both a legal separator and a word boundary; the splitter runs
        // on the input, the separator only on the way out.
        expect(expectSuccess("a.b c", { separator: "dot" }).slug).toBe("a.b.c");
    });
});

describe("slugify — ASCII folding", () => {
    test("folds accents to their plain letters", () => {
        expect(expectSuccess("Café Ünïcodé").slug).toBe("cafe-unicode");
    });

    test("spells out the letters that carry no decomposition", () => {
        expect(expectSuccess("Straße").slug).toBe("strasse");
        expect(expectSuccess("Encyclopædia").slug).toBe("encyclopaedia");
        expect(expectSuccess("Þingvellir Ørsted Łódź").slug).toBe("thingvellir-orsted-lodz");
    });

    test("every transliteration in the map is actually reachable", () => {
        for (const [letter, replacement] of Object.entries(TRANSLITERATIONS)) {
            expect(applyTransliterations(letter)).toBe(replacement);
        }
    });

    test("drops what has no ASCII form, and says so when nothing is left", () => {
        expect(expectSuccess("Bangla বাংলা tools").slug).toBe("bangla-tools");
        expect(slugify("বাংলা টুল", withOptions())).toEqual({ ok: false, reason: "empty_result" });
    });

    test("keeps letters from any script once ASCII-only is off", () => {
        // Bangla carries its vowels as combining marks, so a splitter that
        // treated marks as boundaries would shred every word here.
        expect(expectSuccess("বাংলা টুল", { ascii: false }).slug).toBe("বাংলা-টুল");
        expect(expectSuccess("Café Ünïcodé", { ascii: false }).slug).toBe("café-ünïcodé");
    });
});

describe("slugify — filters", () => {
    test("keeps the case when lowercasing is off", () => {
        expect(expectSuccess("Hello World", { lowercase: false }).slug).toBe("Hello-World");
    });

    test("removes digits, and the words that were only digits", () => {
        expect(expectSuccess("Top 10 HTML5 Tricks in 2026", { stripNumbers: true }).slug).toBe(
            "top-html-tricks-in",
        );
        expect(expectSuccess("Top 10 HTML5 Tricks in 2026").slug).toBe(
            "top-10-html5-tricks-in-2026",
        );
    });

    test("removes English stop words regardless of how they were typed", () => {
        expect(expectSuccess("The Best Way To Learn CSS", { stripStopWords: true }).slug).toBe(
            "best-way-learn-css",
        );
        expect(isStopWord("The")).toBe(true);
        expect(isStopWord("css")).toBe(false);
    });

    test("keeps every stop word lowercase, since the check lowercases first", () => {
        for (const word of STOP_WORDS) {
            expect(word).toBe(word.toLowerCase());
        }
    });

    test("fails rather than pretending, when the filters empty the heading", () => {
        expect(slugify("the and of", withOptions({ stripStopWords: true }))).toEqual({
            ok: false,
            reason: "empty_result",
        });
    });
});

describe("slugify — maximum length", () => {
    test("stops on a word boundary and flags the cut", () => {
        const result = expectSuccess("one two three four five", { maxLength: 11 });

        expect(result.slug).toBe("one-two");
        expect(result.words).toBe(2);
        expect(result.truncated).toBe(true);
    });

    test("counts the separators it emits, not just the words", () => {
        expect(expectSuccess("one two three", { maxLength: 7 }).slug).toBe("one-two");
        expect(expectSuccess("one two three", { maxLength: 6 }).slug).toBe("one");
    });

    test("cuts a single word that is longer than the whole budget", () => {
        const result = expectSuccess("supercalifragilistic", { maxLength: 5 });

        expect(result.slug).toBe("super");
        expect(result.words).toBe(1);
        expect(result.truncated).toBe(true);
    });

    test("zero means no ceiling", () => {
        const long = expectSuccess("one two three four five six seven", { maxLength: 0 });

        expect(long.slug).toBe("one-two-three-four-five-six-seven");
        expect(long.truncated).toBe(false);
    });

    test("counts code points, so an astral character is one character", () => {
        // Four code points, eight UTF-16 units — a units-based cut would keep
        // all four and a naive slice would split a surrogate pair.
        const result = expectSuccess("𝕒𝕓𝕔𝕕", { ascii: false, maxLength: 2 });

        expect(result.slug).toBe("𝕒𝕓");
        expect(result.length).toBe(2);
    });
});

describe("slugify — bulk mode", () => {
    test("slugifies each line on its own", () => {
        expect(
            expectSuccess("How to Learn HTML\n10 Best CSS Tricks!", { perLine: true }).slug,
        ).toBe("how-to-learn-html\n10-best-css-tricks");
    });

    test("keeps a blank line in place, so rows stay lined up", () => {
        expect(expectSuccess("first\n\nthird", { perLine: true }).slug).toBe("first\n\nthird");
    });

    test("accepts whichever line ending was pasted and answers with LF", () => {
        expect(expectSuccess("one\r\ntwo\rthree", { perLine: true }).slug).toBe("one\ntwo\nthree");
    });

    test("applies the length ceiling per line, not to the batch", () => {
        const result = expectSuccess("alpha beta\ngamma delta", { perLine: true, maxLength: 5 });

        expect(result.slug).toBe("alpha\ngamma");
        expect(result.truncated).toBe(true);
    });

    test("treats the whole text as one heading when bulk mode is off", () => {
        expect(expectSuccess("How to Learn HTML\n10 Best CSS Tricks!").slug).toBe(
            "how-to-learn-html-10-best-css-tricks",
        );
    });

    test("fails only when no line produced anything", () => {
        expect(expectSuccess("!!!\nreal heading", { perLine: true }).slug).toBe("\nreal-heading");
        expect(slugify("!!!\n???", withOptions({ perLine: true }))).toEqual({
            ok: false,
            reason: "empty_result",
        });
    });
});
