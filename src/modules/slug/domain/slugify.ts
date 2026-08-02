import { joinLines, splitLines } from "@/modules/tools/domain/lines";
import type { SeparatorResult, SlugOptions, SlugResult } from "../types";
import {
    MAX_SEPARATOR_LENGTH,
    MAX_SLUG_INPUT_LENGTH,
    MAX_SLUG_LENGTH,
    SAFE_SEPARATOR_CHARACTERS,
    SEPARATOR_CHARACTERS,
} from "./constants";
import { isStopWord } from "./stop-words";
import { applyTransliterations } from "./transliterate";

/** Everything that is not a letter or a digit ends a word, in ASCII mode. */
const ASCII_BOUNDARY = /[^A-Za-z0-9]+/;

/**
 * The same idea for any script. Combining marks are *kept*, not treated as
 * boundaries: Bangla and Devanagari carry their vowels as marks, so splitting
 * on them would shred every word into consonants.
 */
const UNICODE_BOUNDARY = /[^\p{L}\p{M}\p{N}]+/u;

const DIGITS = /\p{N}/gu;

/** Counts code points, so an emoji or a Bangla conjunct is one character. */
function characterCount(text: string): number {
    return [...text].length;
}

/** Cuts to `limit` code points without splitting a surrogate pair in half. */
function takeCharacters(text: string, limit: number): string {
    return [...text].slice(0, limit).join("");
}

/**
 * Whether a typed ceiling is one the tool will honour. `0` is legal and means
 * no ceiling at all, which is why this is not simply a range check.
 */
export function isValidMaxLength(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_SLUG_LENGTH;
}

/**
 * Resolves the separator the reader asked for, refusing a typed character a
 * URL would have to escape rather than emitting a slug that needs escaping.
 */
export function resolveSeparator(options: SlugOptions): SeparatorResult {
    if (options.separator !== "custom") {
        return { ok: true, value: SEPARATOR_CHARACTERS[options.separator] };
    }

    if (characterCount(options.customSeparator) > MAX_SEPARATOR_LENGTH) {
        return { ok: false, reason: "separator_too_long" };
    }

    for (const character of options.customSeparator) {
        if (!SAFE_SEPARATOR_CHARACTERS.includes(character)) {
            return { ok: false, reason: "unsafe_separator", character };
        }
    }

    // An empty custom separator is a deliberate choice: it joins the words
    // with nothing at all, which is what `thisisaslug` needs.
    return { ok: true, value: options.customSeparator };
}

function toWords(line: string, options: SlugOptions): string[] {
    const normalized = options.ascii
        ? applyTransliterations(line.normalize("NFKD").replace(/\p{M}+/gu, ""))
        : line.normalize("NFC");

    const words: string[] = [];

    for (const raw of normalized.split(options.ascii ? ASCII_BOUNDARY : UNICODE_BOUNDARY)) {
        const stripped = options.stripNumbers ? raw.replace(DIGITS, "") : raw;

        if (stripped.length === 0) {
            continue;
        }

        // `toLowerCase`, never `toLocaleLowerCase`: the latter reads the host's
        // locale, so the same heading would slug differently on the server and
        // in a Turkish reader's browser.
        const cased = options.lowercase ? stripped.toLowerCase() : stripped;

        if (options.stripStopWords && isStopWord(cased)) {
            continue;
        }

        words.push(cased);
    }

    return words;
}

type JoinedLine = {
    readonly text: string;
    readonly words: number;
    readonly truncated: boolean;
};

function joinWords(words: readonly string[], separator: string, maxLength: number): JoinedLine {
    if (maxLength <= 0) {
        return { text: words.join(separator), words: words.length, truncated: false };
    }

    const separatorLength = characterCount(separator);
    const kept: string[] = [];
    let length = 0;

    for (const word of words) {
        const addition = (kept.length === 0 ? 0 : separatorLength) + characterCount(word);

        if (length + addition > maxLength) {
            break;
        }

        kept.push(word);
        length += addition;
    }

    if (kept.length === 0) {
        // A single word longer than the whole budget is cut rather than
        // dropped: half a word still points at the right page, nothing does not.
        const head = words.length === 0 ? "" : takeCharacters(words[0], maxLength);

        return { text: head, words: head.length === 0 ? 0 : 1, truncated: words.length > 0 };
    }

    return {
        text: kept.join(separator),
        words: kept.length,
        truncated: kept.length < words.length,
    };
}

/**
 * The one transformation the whole tool runs, shared by the server-rendered
 * first paint and every settled keystroke afterwards. Pure and deterministic.
 */
export function slugify(text: string, options: SlugOptions): SlugResult {
    if (characterCount(text) > MAX_SLUG_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const separator = resolveSeparator(options);

    if (!separator.ok) {
        return separator;
    }

    // A blank line in bulk mode still holds its place, so a pasted list and its
    // slugs stay row for row.
    const lines = (options.perLine ? splitLines(text) : [text]).map((line) =>
        joinWords(toWords(line, options), separator.value, options.maxLength),
    );

    const slug = joinLines(
        lines.map((line) => line.text),
        "lf",
    );
    const words = lines.reduce((total, line) => total + line.words, 0);

    if (words === 0 && text.trim().length > 0) {
        return { ok: false, reason: "empty_result" };
    }

    return {
        ok: true,
        slug,
        length: characterCount(slug),
        words,
        truncated: lines.some((line) => line.truncated),
    };
}
