/**
 * The handful of Bengali-block facts both directions of the converter lean on.
 *
 * Written as code points rather than as regular expressions over strings: the
 * converter walks text one code point at a time and asks the same five
 * questions of every one of them, and a `Set` answers each in one step.
 */

export const HASANT = "\u09CD";
export const NUKTA = "\u09BC";
export const ZWJ = "\u200D";
export const ZWNJ = "\u200C";
export const RA = "\u09B0";
export const CHANDRABINDU = "\u0981";
export const ANUSVARA = "\u0982";
export const VISARGA = "\u0983";

export const I_KAR = "\u09BF";
export const E_KAR = "\u09C7";
export const AI_KAR = "\u09C8";
export const O_KAR = "\u09CB";
export const AU_KAR = "\u09CC";
export const AA_KAR = "\u09BE";
export const II_KAR = "\u09C0";
export const U_KAR = "\u09C1";
export const UU_KAR = "\u09C2";
export const RI_KAR = "\u09C3";
export const AU_LENGTH_MARK = "\u09D7";

const CONSONANTS = new Set([
    ..."কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহ",
    "\u09DC", // ড় precomposed
    "\u09DD", // ঢ় precomposed
    "\u09DF", // য় precomposed
]);

/** Written before the consonant they follow in speech — the whole reason Bijoy needs reordering. */
const PRE_KARS = new Set([I_KAR, E_KAR, AI_KAR]);

const POST_KARS = new Set([
    AA_KAR,
    II_KAR,
    U_KAR,
    UU_KAR,
    RI_KAR,
    "\u09C4", // ৄ
    AU_LENGTH_MARK,
    O_KAR,
    AU_KAR,
]);

const VOWEL_LETTERS = new Set([..."অআইঈউঊঋঌএঐওঔ"]);

export function isConsonant(char: string | undefined): boolean {
    return char !== undefined && CONSONANTS.has(char);
}

export function isPreKar(char: string | undefined): boolean {
    return char !== undefined && PRE_KARS.has(char);
}

export function isPostKar(char: string | undefined): boolean {
    return char !== undefined && POST_KARS.has(char);
}

export function isKar(char: string | undefined): boolean {
    return isPreKar(char) || isPostKar(char);
}

export function isVowelLetter(char: string | undefined): boolean {
    return char !== undefined && VOWEL_LETTERS.has(char);
}

/** Anything in the Bengali block that is not a digit — a letter, a sign or a mark. */
export function isBanglaLetterish(char: string | undefined): boolean {
    if (char === undefined) {
        return false;
    }

    const code = char.codePointAt(0) ?? 0;

    return code >= 0x0980 && code <= 0x09ff && (code < 0x09e6 || code > 0x09ef);
}

/** The test behind both notices: is there one Bangla Unicode letter anywhere in this text? */
export function containsBanglaLetter(text: string): boolean {
    for (const char of text) {
        if (isBanglaLetterish(char)) {
            return true;
        }
    }

    return false;
}

/** A space, a line break — or the edge of the text, which bounds a word just the same. */
export function isSpaceOrEdge(char: string | undefined): boolean {
    return char === undefined || /\s/u.test(char);
}

export function isAsciiDigit(char: string | undefined): boolean {
    return char !== undefined && char >= "0" && char <= "9";
}
