import { describe, expect, test } from "bun:test";

import {
    CASE_SAMPLE,
    DEFAULT_TEXT_CASE_OPTIONS,
    MAX_TEXT_CASE_INPUT_LENGTH,
    supportsAcronyms,
} from "@/modules/text-case/domain/constants";
import { convertCase } from "@/modules/text-case/domain/convert";
import {
    IDENTIFIER_CASES,
    PROSE_CASES,
    TEXT_CASES,
    type TextCase,
    type TextCaseOptions,
} from "@/modules/text-case/types";

function withOptions(patch: Partial<TextCaseOptions> = {}): TextCaseOptions {
    return { ...DEFAULT_TEXT_CASE_OPTIONS, ...patch };
}

/** Every assertion below is about the text, so a failure here is a test bug. */
function convert(text: string, patch: Partial<TextCaseOptions> = {}): string {
    const result = convertCase(text, withOptions(patch));

    if (!result.ok) {
        throw new Error(`expected converted text, got ${result.reason}`);
    }

    return result.text;
}

const CAPS_LOCK = "ACCIDENTALLY LEFT THE CAPS LOCK ON AND TYPED SOMETHING.";

describe("the prose cases", () => {
    test("lower and upper rewrite every letter", () => {
        expect(convert("Hello, World!", { textCase: "lower" })).toBe("hello, world!");
        expect(convert("Hello, World!", { textCase: "upper" })).toBe("HELLO, WORLD!");
    });

    test("sentence case repairs a paragraph typed with the caps lock on", () => {
        // The reason most people open this tool at all.
        expect(convert(CAPS_LOCK, { textCase: "sentence" })).toBe(
            "Accidentally left the caps lock on and typed something.",
        );
    });

    test("sentence case starts again after a full stop, a question and an exclamation", () => {
        expect(convert("one. two? three! four", { textCase: "sentence" })).toBe(
            "One. Two? Three! Four",
        );
    });

    test("sentence case starts again on a new line, with or without a stop", () => {
        expect(convert("first heading\nsecond heading", { textCase: "sentence" })).toBe(
            "First heading\nSecond heading",
        );
    });

    test("capitalized case gives every word a capital and lowercases its tail", () => {
        expect(convert("hELLO wORLD of ours", { textCase: "capitalized" })).toBe(
            "Hello World Of Ours",
        );
    });

    test("title case keeps the small words small, but never at either end", () => {
        expect(convert("the art of the deal", { textCase: "title" })).toBe("The Art of the Deal");
        expect(convert("what it is all about", { textCase: "title" })).toBe("What It Is All About");
    });

    test("title case always capitalises the word after a colon", () => {
        expect(convert("a study: the last word", { textCase: "title" })).toBe(
            "A Study: The Last Word",
        );
    });

    test("title case capitalises a small word standing alone", () => {
        // It is both the first word and the last one.
        expect(convert("of", { textCase: "title" })).toBe("Of");
    });

    test("alternating case counts the spaces, so the rhythm carries across words", () => {
        expect(convert("alternating case", { textCase: "alternating" })).toBe("aLtErNaTiNg cAsE");
    });

    test("inverse case swaps each letter and leaves the rest alone", () => {
        expect(convert("Hello, World!", { textCase: "inverse" })).toBe("hELLO, wORLD!");
        expect(convert(convert("Hello", { textCase: "inverse" }), { textCase: "inverse" })).toBe(
            "Hello",
        );
    });

    test("every prose case keeps the punctuation and spacing it was given", () => {
        const source = "  “one” — two (three)…  ";

        for (const textCase of PROSE_CASES) {
            const converted = convert(source, { textCase });

            expect(converted.replace(/\p{L}/gu, "")).toBe(source.replace(/\p{L}/gu, ""));
        }
    });
});

describe("the identifier cases", () => {
    const source = "Hello, cruel world!";

    test("builds each shape from the same words", () => {
        expect(convert(source, { textCase: "camel" })).toBe("helloCruelWorld");
        expect(convert(source, { textCase: "pascal" })).toBe("HelloCruelWorld");
        expect(convert(source, { textCase: "snake" })).toBe("hello_cruel_world");
        expect(convert(source, { textCase: "kebab" })).toBe("hello-cruel-world");
        expect(convert(source, { textCase: "constant" })).toBe("HELLO_CRUEL_WORLD");
        expect(convert(source, { textCase: "dot" })).toBe("hello.cruel.world");
        expect(convert(source, { textCase: "path" })).toBe("hello/cruel/world");
    });

    test("takes an existing identifier apart before rebuilding it", () => {
        expect(convert("XMLHttpRequest", { textCase: "snake" })).toBe("xml_http_request");
        expect(convert("user_first_name", { textCase: "camel" })).toBe("userFirstName");
        expect(convert("get-user-by-id", { textCase: "pascal" })).toBe("GetUserById");
        expect(convert("theURLParser", { textCase: "kebab" })).toBe("the-url-parser");
    });

    test("round-trips between the delimiter shapes", () => {
        expect(
            convert(convert("some long name", { textCase: "snake" }), { textCase: "kebab" }),
        ).toBe("some-long-name");
    });

    test("lowercases the first word of camel case whatever the acronym switch says", () => {
        expect(convert("HTTP response", { textCase: "camel", preserveAcronyms: true })).toBe(
            "httpResponse",
        );
        expect(convert("the HTTP response", { textCase: "camel", preserveAcronyms: true })).toBe(
            "theHTTPResponse",
        );
    });

    test("refuses when there is no word to build a name from", () => {
        for (const textCase of IDENTIFIER_CASES) {
            expect(convertCase("!!! ??? ---", withOptions({ textCase }))).toEqual({
                ok: false,
                reason: "empty_result",
            });
        }
    });

    test("returns an empty result for an empty box rather than refusing", () => {
        const result = convertCase("", withOptions({ textCase: "snake" }));

        expect(result).toMatchObject({ ok: true, text: "" });
    });
});

describe("preserveAcronyms", () => {
    test("leaves a run of capitals alone in the cases that can honour it", () => {
        expect(
            convert("the HTTP and JSON story", { textCase: "title", preserveAcronyms: true }),
        ).toBe("The HTTP and JSON Story");
        expect(
            convert("parse the JSON body", { textCase: "sentence", preserveAcronyms: true }),
        ).toBe("Parse the JSON body");
        expect(convert("an API key", { textCase: "capitalized", preserveAcronyms: true })).toBe(
            "An API Key",
        );
        expect(convert("read API key", { textCase: "pascal", preserveAcronyms: true })).toBe(
            "ReadAPIKey",
        );
    });

    test("flattens the same run when it is off", () => {
        expect(
            convert("the HTTP and JSON story", { textCase: "title", preserveAcronyms: false }),
        ).toBe("The Http and Json Story");
    });

    test("never freezes a one-letter word", () => {
        // `A` and `I` are words, not acronyms, so the switch leaves them to the
        // case rather than pinning them. Deliberate, and it is what makes
        // Sentence case write a lower-case `i` in the middle of a line — the
        // rule is "two capitals or more", not "any capital", and the article's
        // FAQ says so rather than the tool guessing at English pronouns.
        expect(convert("A THING I SAW", { textCase: "sentence", preserveAcronyms: true })).toBe(
            "A THING i SAW",
        );
        expect(convert("a thing I saw", { textCase: "sentence", preserveAcronyms: true })).toBe(
            "A thing i saw",
        );
    });

    test("hands back a fully capitalised paragraph unchanged — the documented trap", () => {
        // Every word is a run of capitals, so every word is an acronym. This is
        // why the switch is off by default; the article says so too.
        expect(convert(CAPS_LOCK, { textCase: "sentence", preserveAcronyms: true })).toBe(
            CAPS_LOCK,
        );
    });

    test("changes nothing in the nine cases that cannot honour it", () => {
        const source = "the HTTP and JSON story";

        for (const textCase of TEXT_CASES.filter((value) => !supportsAcronyms(value))) {
            expect(convert(source, { textCase, preserveAcronyms: true })).toBe(
                convert(source, { textCase, preserveAcronyms: false }),
            );
        }
    });

    test("ignores a word with no cased letters at all", () => {
        // Bangla has no upper and lower case, so `word === word.toUpperCase()`
        // is true of every word in it.
        expect(convert("বাংলা text", { textCase: "capitalized", preserveAcronyms: true })).toBe(
            "বাংলা Text",
        );
    });
});

describe("perLine", () => {
    const list = "first heading\nsecond heading";

    test("builds one identifier per line when it is on", () => {
        expect(convert(list, { textCase: "kebab", perLine: true })).toBe(
            "first-heading\nsecond-heading",
        );
    });

    test("runs the whole passage together when it is off", () => {
        expect(convert(list, { textCase: "kebab", perLine: false })).toBe(
            "first-heading-second-heading",
        );
    });

    test("keeps a blank line in place, so a pasted list stays row for row", () => {
        expect(convert("one\n\ntwo", { textCase: "upper", perLine: true })).toBe("ONE\n\nTWO");
    });

    test("preserves the line endings it was given rather than normalising them", () => {
        expect(convert("one\r\ntwo\rthree", { textCase: "upper", perLine: true })).toBe(
            "ONE\r\nTWO\rTHREE",
        );
    });

    test("restarts the alternating rhythm on each line", () => {
        expect(convert("ab\nab", { textCase: "alternating", perLine: true })).toBe("aB\naB");
        expect(convert("ab\nab", { textCase: "alternating", perLine: false })).toBe("aB\nAb");
    });
});

describe("convertCase — the contract around the conversion", () => {
    test("reports the size of what it produced", () => {
        const result = convertCase("hello world", withOptions({ textCase: "upper" }));

        expect(result).toMatchObject({
            ok: true,
            text: "HELLO WORLD",
            stats: { characters: 11, words: 2, lines: 1 },
        });
    });

    test("says so when the text was already in the requested case", () => {
        expect(convertCase("HELLO", withOptions({ textCase: "upper" }))).toMatchObject({
            unchanged: true,
        });
        expect(convertCase("hello", withOptions({ textCase: "upper" }))).toMatchObject({
            unchanged: false,
        });
    });

    test("refuses an input longer than the ceiling", () => {
        const tooLong = "a".repeat(MAX_TEXT_CASE_INPUT_LENGTH + 1);

        expect(convertCase(tooLong, withOptions())).toEqual({ ok: false, reason: "too_long" });
    });

    test("accepts an input exactly at the ceiling", () => {
        const exact = "a".repeat(MAX_TEXT_CASE_INPUT_LENGTH);

        expect(convertCase(exact, withOptions()).ok).toBe(true);
    });

    test("measures the ceiling in code points, not UTF-16 units", () => {
        // Each emoji is two units and one character, so this is half the
        // ceiling by the wrong measure and exactly at it by the right one.
        const emoji = "🙂".repeat(MAX_TEXT_CASE_INPUT_LENGTH);

        expect(convertCase(emoji, withOptions()).ok).toBe(true);
    });

    test("is deterministic — the same input and options give the same answer", () => {
        for (const textCase of TEXT_CASES) {
            const options = withOptions({ textCase });

            expect(convertCase(CAPS_LOCK, options)).toEqual(convertCase(CAPS_LOCK, options));
        }
    });
});

describe("the picker sample", () => {
    test("comes out different in all fourteen cases", () => {
        const rendered = TEXT_CASES.map((textCase) =>
            convert(CASE_SAMPLE, { textCase, perLine: false, preserveAcronyms: false }),
        );

        // The chips are told apart by their samples. Two that render the same
        // would make the picker look broken, and the sample is what has to
        // change — never the cases.
        expect(new Set(rendered).size).toBe(TEXT_CASES.length);
    });

    test("renders each chip the way its own name promises", () => {
        const expected: Record<TextCase, string> = {
            sentence: "Two of us",
            lower: "two of us",
            upper: "TWO OF US",
            capitalized: "Two Of Us",
            title: "Two of Us",
            alternating: "tWo oF Us",
            inverse: "tWO oF uS",
            camel: "twoOfUs",
            pascal: "TwoOfUs",
            snake: "two_of_us",
            kebab: "two-of-us",
            constant: "TWO_OF_US",
            dot: "two.of.us",
            path: "two/of/us",
        };

        for (const textCase of TEXT_CASES) {
            expect(convert(CASE_SAMPLE, { textCase, preserveAcronyms: false })).toBe(
                expected[textCase],
            );
        }
    });
});
