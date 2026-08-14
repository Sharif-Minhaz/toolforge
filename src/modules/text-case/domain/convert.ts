import type { IdentifierCase, ProseCase, TextCaseOptions, TextCaseResult } from "../types";
import { isIdentifierCase, MAX_TEXT_CASE_INPUT_LENGTH } from "./constants";
import { isSmallWord } from "./small-words";
import { describeText } from "./statistics";
import { mapProseWords, splitWords, type ProseWord } from "./words";

/**
 * What every identifier case joins its words with. `camel` and `pascal` are
 * absent because they join with nothing and carry the boundary in the capital
 * instead — which is why they are the two that read the `preserveAcronyms`
 * switch and the other five cannot.
 */
const DELIMITERS: Record<Exclude<IdentifierCase, "camel" | "pascal">, string> = {
    snake: "_",
    kebab: "-",
    constant: "_",
    dot: ".",
    path: "/",
};

/**
 * What ends a sentence. The ellipsis is here as its own character as well as
 * three stops, and a line break counts: a heading on its own line is a sentence
 * whether or not anybody put a full stop after it.
 */
const SENTENCE_END = /[.!?…\n\r]/u;

/** A colon starts a subtitle, and the word after one is always capitalised. */
const COLON = /:/u;

/** How little has to be left before an empty output is a refusal, not an answer. */
function isBlank(text: string): boolean {
    return text.trim().length === 0;
}

/** Any of the three line endings, captured so the ending itself survives. */
const LINE_PARTS = /(\r\n|\r|\n)/;

/**
 * Whether a word is an acronym worth leaving alone.
 *
 * Three conditions, and dropping any one of them breaks a real case: at least
 * two letters, so `A` and `I` are still sentence words; every cased letter
 * already upper, so `Api` is not one; and at least one cased letter, so a
 * Bangla or CJK word — where upper and lower are the same string — is not
 * mistaken for an acronym and frozen.
 */
function isAcronym(word: string): boolean {
    const letters = [...word].filter((character) => /\p{L}/u.test(character));

    return letters.length >= 2 && word === word.toUpperCase() && word !== word.toLowerCase();
}

/**
 * `toLowerCase`, never `toLocaleLowerCase`, throughout this file. The locale
 * form reads the host's language, so a Turkish reader's browser would fold `I`
 * to a dotless `ı` while the server folded it to `i` — two different answers
 * either side of hydration, for text that has nothing to do with Turkish.
 */
function lowerWord(word: string, preserveAcronyms: boolean): string {
    return preserveAcronyms && isAcronym(word) ? word : word.toLowerCase();
}

function capitalizeWord(word: string, preserveAcronyms: boolean): string {
    if (preserveAcronyms && isAcronym(word)) {
        return word;
    }

    // Spread rather than `charAt`, so a word starting outside the basic plane
    // does not have its first character cut in half.
    const [first, ...rest] = [...word];

    return first === undefined ? word : first.toUpperCase() + rest.join("").toLowerCase();
}

function startsSentence(word: ProseWord): boolean {
    return word.index === 0 || SENTENCE_END.test(word.gap);
}

/**
 * Title Case, following the rules of the small-word list it borrows: the first
 * and last words always take a capital, so does anything after a colon, and the
 * listed words take one nowhere else.
 */
function titleWord(word: ProseWord, total: number, preserveAcronyms: boolean): string {
    const isEdge = word.index === 0 || word.index === total - 1;

    if (isEdge || COLON.test(word.gap) || !isSmallWord(word.text)) {
        return capitalizeWord(word.text, preserveAcronyms);
    }

    return lowerWord(word.text, preserveAcronyms);
}

/** Even code points lower, odd upper — counting the spaces, which is what makes
 *  the rhythm carry across a word boundary instead of restarting at each one. */
function alternate(text: string): string {
    return [...text]
        .map((character, index) =>
            index % 2 === 0 ? character.toLowerCase() : character.toUpperCase(),
        )
        .join("");
}

function invert(text: string): string {
    return [...text]
        .map((character) => {
            const upper = character.toUpperCase();

            return character === upper ? character.toLowerCase() : upper;
        })
        .join("");
}

function convertProse(text: string, textCase: ProseCase, preserveAcronyms: boolean): string {
    switch (textCase) {
        case "lower":
            return text.toLowerCase();
        case "upper":
            return text.toUpperCase();
        case "alternating":
            return alternate(text);
        case "inverse":
            return invert(text);
        case "capitalized":
            return mapProseWords(text, (word) => capitalizeWord(word.text, preserveAcronyms));
        case "sentence":
            return mapProseWords(text, (word) =>
                startsSentence(word)
                    ? capitalizeWord(word.text, preserveAcronyms)
                    : lowerWord(word.text, preserveAcronyms),
            );
        case "title":
            return mapProseWords(text, (word, total) => titleWord(word, total, preserveAcronyms));
    }
}

function convertIdentifier(
    text: string,
    textCase: IdentifierCase,
    preserveAcronyms: boolean,
): string {
    const words = splitWords(text);

    if (textCase === "pascal") {
        return words.map((word) => capitalizeWord(word, preserveAcronyms)).join("");
    }

    if (textCase === "camel") {
        // The first word is lowercased whatever the acronym switch says.
        // `HTTPResponse` in camel case is `httpResponse` in every codebase that
        // has ever been written, and an identifier that opens with a capital is
        // not camel case at all.
        return words
            .map((word, index) =>
                index === 0 ? word.toLowerCase() : capitalizeWord(word, preserveAcronyms),
            )
            .join("");
    }

    const cased =
        textCase === "constant"
            ? words.map((word) => word.toUpperCase())
            : words.map((word) => word.toLowerCase());

    return cased.join(DELIMITERS[textCase]);
}

function convertSegment(segment: string, options: TextCaseOptions): string {
    return isIdentifierCase(options.textCase)
        ? convertIdentifier(segment, options.textCase, options.preserveAcronyms)
        : convertProse(segment, options.textCase, options.preserveAcronyms);
}

/**
 * The one transformation the whole tool runs, shared by the server-rendered
 * first paint and every settled keystroke afterwards. Pure and deterministic.
 */
export function convertCase(text: string, options: TextCaseOptions): TextCaseResult {
    if ([...text].length > MAX_TEXT_CASE_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    // The line endings are captured and put back verbatim rather than
    // normalised: a reader who pasted a Windows document is converting its
    // case, and handing back LF would be a second edit they did not ask for.
    const converted = options.perLine
        ? text
              .split(LINE_PARTS)
              .map((part, index) => (index % 2 === 1 ? part : convertSegment(part, options)))
              .join("")
        : convertSegment(text, options);

    // Only ever reachable from an identifier case, which throws the punctuation
    // away: `!!! ???` holds no words, so there is no name to build. A prose
    // case keeps every character it was given, so it cannot empty a box that
    // had something in it, and a box that was blank to begin with is answered
    // with a blank rather than a complaint.
    if (!isBlank(text) && isBlank(converted)) {
        return { ok: false, reason: "empty_result" };
    }

    return {
        ok: true,
        text: converted,
        stats: describeText(converted),
        unchanged: converted === text,
    };
}
