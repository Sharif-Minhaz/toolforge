/**
 * Finding words in a passage, twice over.
 *
 * The two families need two different answers, and conflating them is the bug
 * this file exists to avoid:
 *
 * - **A prose word** is a unit to capitalise *in place*. `don't` is one word,
 *   not two, or Title Case writes `Don'T`. Everything around it — brackets,
 *   quotes, em dashes — is left exactly where it was.
 * - **An identifier word** is a piece to rebuild from. `XMLHttpRequest` is
 *   three of them, because `xml_http_request` is the answer somebody wants back
 *   and `xmlhttprequest` is not.
 */

/**
 * A run of letters, marks and digits, with inner apostrophes kept.
 *
 * Both apostrophes are admitted: a keyboard types `'` and every word processor
 * rewrites it to `’`, so text pasted out of one holds the curly form and text
 * typed into the box holds the straight one.
 *
 * Combining marks are inside the class rather than treated as boundaries.
 * Bangla and Devanagari carry their vowels as marks, and splitting on them
 * would shred every word into consonants.
 */
const PROSE_WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/** Everything that is not a letter, a mark or a digit ends an identifier word. */
const IDENTIFIER_BOUNDARY = /[^\p{L}\p{M}\p{N}]+/u;

/**
 * The marker inserted between camel humps before splitting on it.
 *
 * A space is safe to borrow: it is not a letter, a mark or a digit, so
 * `IDENTIFIER_BOUNDARY` has already taken every one the reader typed out of the
 * chunk before it reaches here.
 */
const HUMP = " ";

/**
 * Apostrophes are dropped rather than split on, so `don't stop` becomes
 * `dontStop` rather than `donTStop`. A contraction is one word to whoever typed
 * it, and half of one is not a name anybody wants back.
 */
const APOSTROPHES = /['’]/gu;

/** Where a word ends because the next letter is a capital: `fooBar`, `utf8Decoder`. */
const LOWER_THEN_UPPER = /([\p{Ll}\p{M}\p{N}])(\p{Lu})/gu;

/** Where an acronym ends because a word begins inside it: `XMLHttp`, `HTTPServer`. */
const ACRONYM_THEN_WORD = /(\p{Lu})(\p{Lu}[\p{Ll}\p{M}])/gu;

export type ProseWord = {
    readonly text: string;
    /** 0-based position among the words of this passage. */
    readonly index: number;
    /** Everything between the previous word and this one; the leading text at index 0. */
    readonly gap: string;
};

/**
 * Rewrites every prose word through `map`, leaving all the space between them
 * untouched. The whole prose half of the tool is built on this: what separates
 * Sentence case from Title Case is only which words are handed a capital.
 */
export function mapProseWords(
    text: string,
    map: (word: ProseWord, total: number) => string,
): string {
    const matches = [...text.matchAll(PROSE_WORD)];

    let output = "";
    let cursor = 0;

    matches.forEach((match, index) => {
        const start = match.index;
        const gap = text.slice(cursor, start);

        output += gap + map({ text: match[0], index, gap }, matches.length);
        cursor = start + match[0].length;
    });

    return output + text.slice(cursor);
}

/** Splits one boundary-free chunk on its internal case changes. */
function splitHumps(chunk: string): string[] {
    return chunk
        .replace(LOWER_THEN_UPPER, `$1${HUMP}$2`)
        .replace(ACRONYM_THEN_WORD, `$1${HUMP}$2`)
        .split(HUMP)
        .filter((part) => part.length > 0);
}

/**
 * The words an identifier is built from.
 *
 * Digits stay attached to the run they were typed in — `utf8Decoder` is `utf8`
 * and `Decoder`, not `utf`, `8`, `Decoder` — because `utf_8_decoder` is not a
 * name anybody writes.
 */
export function splitWords(text: string): string[] {
    return text
        .replace(APOSTROPHES, "")
        .split(IDENTIFIER_BOUNDARY)
        .filter((chunk) => chunk.length > 0)
        .flatMap(splitHumps);
}
