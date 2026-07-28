import { BLOCKED_WORDS } from "./blocklist";

export type BlockedWord = {
    /** The blocklist entry that matched, in its plain form. */
    readonly term: string;
    /** The token as the reader actually typed it, so they can find it again. */
    readonly match: string;
};

/**
 * Characters people substitute for letters. These never occur as sentence
 * punctuation, so they can be resolved wherever they appear — which is what
 * catches `@sshole` and `4ss`.
 */
const LEET_SUBSTITUTIONS: readonly (readonly [RegExp, string])[] = [
    [/[@4]/gu, "a"],
    [/[$5]/gu, "s"],
    [/1/gu, "i"],
    [/0/gu, "o"],
    [/3/gu, "e"],
    [/7/gu, "t"],
];

/**
 * `!` and `|` stand in for `i` only with a real character on each side.
 * Resolving them anywhere would fold `shit!` into `shiti` and let an ordinary
 * exclamation mark defeat the entire list.
 */
const INTERIOR_SUBSTITUTIONS: readonly (readonly [RegExp, string])[] = [
    [/(?<=[\p{L}\p{N}\p{M}])[!|](?=[\p{L}\p{N}\p{M}])/gu, "i"],
];

/** Anything that is not a letter, digit or combining mark is a separator. */
const NON_WORD = /[^\p{L}\p{N}\p{M}]/gu;

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Folds one whitespace-separated chunk down to comparable letters: lower case,
 * leet characters resolved, and every separator dropped. Dropping separators is
 * what catches `f-u-c-k` and `s*h*i*t`; it is safe because the result is
 * compared against whole entries rather than searched for inside the text, so
 * `Scunthorpe` and `classic` have nothing to collide with.
 */
function foldToken(raw: string): string {
    let folded = raw.toLowerCase();

    for (const [pattern, replacement] of [...INTERIOR_SUBSTITUTIONS, ...LEET_SUBSTITUTIONS]) {
        folded = folded.replace(pattern, replacement);
    }

    return folded.replace(NON_WORD, "");
}

/**
 * Three readings of the same token, because letter-stretching cannot be undone
 * one way: collapsing runs to a single letter recovers `fuuuck`, collapsing to
 * a pair recovers `asss`, and the untouched form covers everything else.
 */
function candidateForms(raw: string): readonly string[] {
    const folded = foldToken(raw);

    if (folded.length === 0) {
        return [];
    }

    return [folded, folded.replace(/(.)\1+/gu, "$1"), folded.replace(/(.)\1{2,}/gu, "$1$1")];
}

/** Folded entry → the plain form, built once at module load. */
const BLOCKED_BY_FORM: ReadonlyMap<string, string> = new Map(
    BLOCKED_WORDS.map((word) => [foldToken(word), word]),
);

/**
 * Finds blocked terms in a passage. Matching is whole-token, never substring,
 * so an innocent word that merely contains a blocked one is never flagged.
 *
 * Results are deduplicated by entry and returned in the order they first
 * appear, so the reader is pointed at the earliest offender first.
 */
export function findBlockedWords(text: string): readonly BlockedWord[] {
    const found = new Map<string, string>();

    for (const chunk of text.split(/\s+/u)) {
        if (chunk.length === 0) {
            continue;
        }

        for (const form of candidateForms(chunk)) {
            const term = BLOCKED_BY_FORM.get(form);

            if (term !== undefined) {
                if (!found.has(term)) {
                    found.set(term, chunk.replace(EDGE_PUNCTUATION, "") || chunk);
                }

                break;
            }
        }
    }

    return [...found].map(([term, match]) => ({ term, match }));
}

export function containsBlockedWords(text: string): boolean {
    return findBlockedWords(text).length > 0;
}

/**
 * Keeps the first and last character so the reader can spot the word in their
 * own text, without the page rendering it in full.
 */
export function maskBlockedWord(word: string): string {
    if (word.length <= 2) {
        return "*".repeat(word.length);
    }

    return `${word[0]}${"*".repeat(word.length - 2)}${word.at(-1)}`;
}
