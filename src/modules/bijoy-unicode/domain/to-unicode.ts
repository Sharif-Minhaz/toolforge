import {
    BIJOY_GLYPHS,
    BIJOY_HASANT,
    BIJOY_REPH,
    CP1252_HIGH_ROW,
    DIGIT_SYMBOL_CODES,
    FIRST_HALF_CODES,
    SECOND_HALF_CODES,
    STANDALONE_SYMBOL_CODES,
} from "./glyph-table";
import {
    AA_KAR,
    ANUSVARA,
    AU_KAR,
    AU_LENGTH_MARK,
    CHANDRABINDU,
    E_KAR,
    HASANT,
    isAsciiDigit,
    isBanglaLetterish,
    isConsonant,
    isPostKar,
    isPreKar,
    isSpaceOrEdge,
    isVowelLetter,
    NUKTA,
    O_KAR,
    RA,
    RI_KAR,
    U_KAR,
    UU_KAR,
    VISARGA,
    ZWJ,
    ZWNJ,
} from "./script";

/**
 * One code point on its way out. `literal` marks a character that is not Bangla
 * — a quote, a digit after `×`, an emoji — and must be left exactly where it
 * stands rather than be swept up by the reordering pass.
 */
type Atom = {
    readonly char: string;
    readonly literal: boolean;
};

/**
 * Stands in for the reph between the two passes. A private-use code point, so it
 * can never collide with anything the reader typed: the first pass only knows
 * that a reph was drawn here, and the second decides which letter it belongs to.
 */
const REPH_MARK = "\uE000";

/** What can follow a symbol and still leave it standing alone. */
const CLOSING_PUNCTUATION = new Set([..."),.;:!?]"]);

/**
 * Bijoy text to Unicode Bangla.
 *
 * Two passes, because the two problems are different. The first reads each code
 * as the glyph it draws — deciding, for the third of them that double as
 * punctuation, which one is meant. The second puts the result into spoken
 * order: a vowel sign drawn before its consonant moves after it, and a reph
 * drawn after its consonant moves before it.
 */
export function bijoyToUnicode(input: string): string {
    const atoms = readGlyphs(foldLegacyCodes(input));

    // NFC because it is what every other piece of Unicode text is compared in:
    // it writes ড় ঢ় য় as a letter and a nukta, which is how search, sorting
    // and databases expect them.
    return reorder(atoms).normalize("NFC");
}

/**
 * Undoes the two ways a Bijoy file is commonly mangled before it gets here.
 * Text that went through a Latin-1 decoder carries the 0x80–0x9F row as C1
 * control characters; text copied from a Symbol-encoded PDF carries every byte
 * in the U+F000 private-use page. Both are folded back to the code SutonnyMJ
 * meant.
 */
function foldLegacyCodes(input: string): string[] {
    const chars: string[] = [];

    for (const char of input) {
        chars.push(foldCode(char));
    }

    return chars;
}

function foldCode(char: string): string {
    const code = char.codePointAt(0) ?? 0;

    if (code >= 0x80 && code <= 0x9f) {
        return CP1252_HIGH_ROW[code - 0x80] || char;
    }

    if (code >= 0xf020 && code <= 0xf0ff) {
        return foldCode(String.fromCodePoint(code - 0xf000));
    }

    // The Greek mu a word processor substitutes for the micro sign, µ — ক্র.
    if (code === 0x03bc) {
        return "\u00B5";
    }

    return char;
}

function beginsLetter(char: string | undefined): boolean {
    const reading = char === undefined ? undefined : BIJOY_GLYPHS[char];
    const first = reading?.[0];

    return isConsonant(first) || first === HASANT;
}

function beginsConsonant(char: string | undefined): boolean {
    return isConsonant(char === undefined ? undefined : BIJOY_GLYPHS[char]?.[0]);
}

/** The nearest character before `index` that is not a space. */
function previousNonSpace(chars: readonly string[], index: number): string | undefined {
    let cursor = index - 1;

    while (cursor >= 0 && chars[cursor] === " ") {
        cursor--;
    }

    return chars[cursor];
}

function nextNonSpace(chars: readonly string[], index: number): string | undefined {
    let cursor = index + 1;

    while (cursor < chars.length && chars[cursor] === " ") {
        cursor++;
    }

    return chars[cursor];
}

function readGlyphs(chars: readonly string[]): Atom[] {
    const atoms: Atom[] = [];
    // The last Bangla code point written — the context every ambiguous code is
    // read against. Reset by anything literal, so a quote cannot make the next
    // `“` into a vowel sign.
    let last: string | undefined;

    function push(reading: string) {
        for (const char of reading) {
            // Two hasants in a row are one: `¯&Í` and `¯Í` mean the same স্ত.
            if (char === HASANT && last === HASANT) {
                continue;
            }

            atoms.push({ char, literal: false });
            last = char;
        }
    }

    function keep(char: string) {
        atoms.push({ char, literal: true });
        last = undefined;
    }

    function markReph() {
        atoms.push({ char: REPH_MARK, literal: false });
    }

    for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        const next = chars[index + 1];
        const previous = chars[index - 1];

        const afterConsonant = isConsonant(last) || last === NUKTA;
        const afterLetter = afterConsonant || last === HASANT;
        const afterBangla = isBanglaLetterish(last);

        if (char === "A" && next === "v") {
            push("আ");
            index++;
            continue;
        }

        // র with ya-phala, as in র‍্যাব: the joiner keeps it from being read
        // as a reph on য.
        if (char === "i" && next === "\u00A8") {
            push(`${RA}${ZWJ}${HASANT}য`);
            index++;
            continue;
        }

        switch (char) {
            case BIJOY_REPH:
                if (afterConsonant || isPostKar(last)) {
                    markReph();
                } else {
                    keep(char);
                }
                continue;
            case "\u00CD": // Í
                if (last === HASANT) {
                    push("ত");
                } else if (afterBangla) {
                    push("ত্ম");
                } else {
                    keep(char);
                }
                continue;
            case "\u00E6": // æ
                if (last === RA) {
                    push(U_KAR);
                } else if (afterBangla) {
                    push("ম্ন");
                } else {
                    keep(char);
                }
                continue;
            case "\u00F8": // ø
                push(afterLetter ? "্ল" : "স্ন");
                continue;
            case "\u00D0": // Ð
                if (afterBangla) {
                    push("ণ্ড");
                } else {
                    keep("\u2013");
                }
                continue;
            case "\u201C": // “
            case "\u2013": // –
                if (afterConsonant) {
                    push(U_KAR);
                } else {
                    keep(char);
                }
                continue;
            case "~":
            case "\u0192": // ƒ
            case "\u201A": // ‚
                if (afterConsonant) {
                    push(UU_KAR);
                } else {
                    keep(char);
                }
                continue;
            case "\u201E": // „
            case "\u2026": // …
                if (afterConsonant) {
                    push(RI_KAR);
                } else {
                    keep(char);
                }
                continue;
            case "\u2018": // ‘
            case "\u2019": // ’
            case "\u2014": // —
            case "@":
                if (last === HASANT) {
                    push(BIJOY_GLYPHS[char].slice(1));
                } else {
                    keep(char);
                }
                continue;
            case "\u201D": // ”
                if (next === "P" || next === "Q" || next === "T") {
                    push("চ্");
                } else {
                    keep(char);
                }
                continue;
            case "\u2022": // •
                if (beginsConsonant(next)) {
                    push("ঙ্");
                } else {
                    keep(char);
                }
                continue;
            case BIJOY_HASANT:
                if (!afterConsonant) {
                    keep(char);
                    continue;
                }
                push(HASANT);
                // An explicit hasant before another consonant is the reader
                // asking for the two *not* to join; the non-joiner says so.
                if (beginsConsonant(next)) {
                    atoms.push({ char: ZWNJ, literal: false });
                    last = ZWNJ;
                }
                continue;
            case "\u00F7": // ÷
                if (
                    isAsciiDigit(previousNonSpace(chars, index)) &&
                    isAsciiDigit(nextNonSpace(chars, index))
                ) {
                    keep(char);
                    continue;
                }
                break;
            default:
                break;
        }

        if (
            STANDALONE_SYMBOL_CODES.has(char) &&
            isSpaceOrEdge(previous) &&
            (isSpaceOrEdge(next) || CLOSING_PUNCTUATION.has(next))
        ) {
            keep(char);
            continue;
        }

        if (DIGIT_SYMBOL_CODES.has(char)) {
            const before = char === "\u00D7" ? previousNonSpace(chars, index) : previous;

            if (isAsciiDigit(before) || (char === "\u00D7" && !afterBangla)) {
                keep(char);
                continue;
            }
        }

        if (SECOND_HALF_CODES.has(char)) {
            const yaAfterVowel =
                char === "\u00A8" &&
                (isVowelLetter(last) || last === U_KAR || last === UU_KAR || last === RI_KAR);

            if (!afterLetter && last !== ZWJ && !yaAfterVowel) {
                keep(char);
                continue;
            }
        }

        if (FIRST_HALF_CODES.has(char) && !beginsLetter(next)) {
            keep(char);
            continue;
        }

        const reading = BIJOY_GLYPHS[char];

        if (reading === undefined) {
            keep(char);
        } else {
            push(reading);
        }
    }

    return atoms;
}

/**
 * Drawing order to spoken order.
 *
 * Bijoy writes ি ে ৈ before the consonant cluster they follow, ো and ৌ as ে on
 * one side of it and া or ৗ on the other, and the reph after the cluster it
 * sits on. Unicode wants all three the other way round.
 */
function reorder(atoms: readonly Atom[]): string {
    const out: string[] = [];
    // Where the most recent consonant cluster began in `out`, for a reph that
    // turns up after it. Cleared by anything that ends the syllable.
    let clusterStart = -1;

    const at = (index: number): string | undefined => {
        const atom = atoms[index];

        return atom === undefined || atom.literal ? undefined : atom.char;
    };

    const consonantAt = (index: number) => isConsonant(at(index));

    // Splices just behind the tail, so it moves one cluster's worth of
    // characters, never the whole document.
    const insertReph = (position: number) => out.splice(position, 0, RA, HASANT);

    function emitCluster(start: number): number {
        out.push(atoms[start].char);
        let index = start + 1;

        for (;;) {
            const char = at(index);

            if (char === NUKTA) {
                out.push(char);
                index++;
            } else if (char === HASANT && consonantAt(index + 1)) {
                out.push(HASANT, atoms[index + 1].char);
                index += 2;
            } else if (char === HASANT && at(index + 1) === ZWNJ && consonantAt(index + 2)) {
                out.push(HASANT, ZWNJ, atoms[index + 2].char);
                index += 3;
            } else if (char === ZWJ && at(index + 1) === HASANT && consonantAt(index + 2)) {
                out.push(ZWJ, HASANT, atoms[index + 2].char);
                index += 3;
            } else {
                return index;
            }
        }
    }

    function placePreKar(start: number): number {
        const kar = atoms[start].char;
        let index = start + 1;
        let chandrabindu = false;

        while (at(index) === CHANDRABINDU) {
            chandrabindu = true;
            index++;
        }

        // A vowel sign with no consonant after it has nothing to move behind.
        if (!consonantAt(index)) {
            out.push(kar);
            if (chandrabindu) {
                out.push(CHANDRABINDU);
            }
            clusterStart = -1;

            return index;
        }

        const cluster = out.length;
        index = emitCluster(index);

        let reph = false;

        while (at(index) === REPH_MARK || at(index) === CHANDRABINDU) {
            if (at(index) === REPH_MARK) {
                reph = true;
            } else {
                chandrabindu = true;
            }
            index++;
        }

        // A reph typed in the middle of a cluster still belongs to all of it.
        if (reph) {
            while (at(index) === HASANT && consonantAt(index + 1)) {
                out.push(HASANT, atoms[index + 1].char);
                index += 2;
            }
        }

        let sign = kar;

        if (kar === E_KAR && at(index) === AA_KAR) {
            sign = O_KAR;
            index++;
        } else if (kar === E_KAR && at(index) === AU_LENGTH_MARK) {
            sign = AU_KAR;
            index++;
        }

        out.push(sign);

        if (at(index) === CHANDRABINDU) {
            chandrabindu = true;
            index++;
        }

        if (chandrabindu) {
            out.push(CHANDRABINDU);
        }

        if (reph) {
            insertReph(cluster);
        }

        clusterStart = reph ? -1 : cluster;

        return index;
    }

    let index = 0;

    while (index < atoms.length) {
        const atom = atoms[index];

        if (atom.literal) {
            out.push(atom.char);
            clusterStart = -1;
            index++;
            continue;
        }

        const char = atom.char;

        if (char === REPH_MARK) {
            if (clusterStart >= 0) {
                insertReph(clusterStart);
                clusterStart = -1;
            } else {
                out.push(RA, HASANT);
            }
            index++;
            continue;
        }

        if (isPreKar(char)) {
            index = placePreKar(index);
            continue;
        }

        if (isConsonant(char)) {
            clusterStart = out.length;
            index = emitCluster(index);
            continue;
        }

        // ঁ typed before the vowel sign it sits over: চঁাদ is চাঁদ.
        if (char === CHANDRABINDU && isPostKar(at(index + 1))) {
            out.push(atoms[index + 1].char, CHANDRABINDU);
            index += 2;
            continue;
        }

        // A ু ূ ৃ typed before the second half of its cluster belongs after it.
        if (
            (char === U_KAR || char === UU_KAR || char === RI_KAR) &&
            clusterStart >= 0 &&
            at(index + 1) === HASANT &&
            consonantAt(index + 2)
        ) {
            index++;
            while (at(index) === HASANT && consonantAt(index + 1)) {
                out.push(HASANT, atoms[index + 1].char);
                index += 2;
            }
            out.push(char);
            continue;
        }

        out.push(char);

        const keepsSyllableOpen =
            isPostKar(char) ||
            char === ANUSVARA ||
            char === VISARGA ||
            char === CHANDRABINDU ||
            char === HASANT ||
            char === ZWNJ;

        if (!keepsSyllableOpen) {
            clusterStart = -1;
        }

        index++;
    }

    return out.join("");
}
