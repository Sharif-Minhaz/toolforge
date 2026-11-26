import {
    UNICODE_CONJUNCTS,
    UNICODE_FIRST_HALVES,
    UNICODE_LETTERS,
    UNICODE_SECOND_HALVES,
    UNICODE_SIGNS,
    WIDE_STEM_CONSONANTS,
} from "./glyph-table";
import {
    AA_KAR,
    AI_KAR,
    ANUSVARA,
    AU_KAR,
    AU_LENGTH_MARK,
    CHANDRABINDU,
    E_KAR,
    HASANT,
    I_KAR,
    II_KAR,
    isBanglaLetterish,
    isConsonant,
    isKar,
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

type GlyphKind = "full" | "half" | "ligature" | "second" | "hasant";

/** One drawn piece of a cluster, and the consonant it ends on. */
type Glyph = {
    code: string;
    readonly kind: GlyphKind;
    readonly consonant: string;
};

/** The letter and nukta Unicode keeps apart, and the one code Bijoy has for each. */
const NUKTA_LETTERS: Readonly<Record<string, string>> = {
    ড: "\u09DC",
    ঢ: "\u09DD",
    য: "\u09DF",
};

/** The glyphs a ু drawn under র has to take its own shape for. */
const RA_GLYPHS = new Set([
    "i",
    "\u00AA",
    "\u00D6",
    "\u00AB",
    "\u00CE",
    "\u00B5",
    "\u00E5",
    "\u00BF",
    "\u0152",
    "\u00A3",
]);

/** What a pre-base vowel sign counts as the start of a word after. */
const WORD_OPENERS = new Set([..." \t\n\r([{\"'-/", "\u00D2", "\u00D4"]);

/**
 * Unicode Bangla to Bijoy text, for a SutonnyMJ font to draw.
 *
 * Works a syllable at a time: an optional reph, a consonant cluster, its vowel
 * sign and any ঁ ং ঃ after it. The cluster is drawn from the font's ligatures
 * where it has one and from half- and second-half forms where it does not; the
 * vowel sign is split around it the way SutonnyMJ expects to draw it.
 *
 * Anything that is not Bangla passes through untouched — which means English in
 * the same passage will *also* be drawn as Bangla by the font. That is the
 * nature of Bijoy, and the page says so.
 */
export function unicodeToBijoy(input: string): string {
    const chars = toCodePoints(input.normalize("NFC"));
    const out: string[] = [];

    const atWordStart = () => {
        const previous = out.at(-1)?.at(-1);

        return previous === undefined || WORD_OPENERS.has(previous);
    };

    let index = 0;

    while (index < chars.length) {
        const char = chars[index];

        if (isConsonant(char)) {
            index = writeSyllable(chars, index, out, atWordStart());
            continue;
        }

        if (isVowelLetter(char)) {
            out.push(UNICODE_LETTERS[char] ?? char);
            index++;

            // অ্যা: a vowel letter carrying ya-phala, as English loanwords do.
            if (chars[index] === HASANT && chars[index + 1] === "য") {
                out.push(UNICODE_SECOND_HALVES["য"]);
                index += 2;
            }
            continue;
        }

        const sign = UNICODE_SIGNS[char];

        if (sign !== undefined) {
            out.push(sign);
            index++;
            continue;
        }

        if (isKar(char)) {
            out.push(strayKar(char, atWordStart()));
            index++;
            continue;
        }

        if (char === HASANT) {
            out.push("&");
            index++;
            if (chars[index] === ZWNJ || chars[index] === ZWJ) {
                index++;
            }
            continue;
        }

        // A joiner inside Bangla only steered the shaping engine, and the font
        // does its own; one between two non-Bangla characters is kept.
        if (char === ZWJ || char === ZWNJ) {
            if (!isBanglaLetterish(chars[index - 1]) && !isBanglaLetterish(chars[index + 1])) {
                out.push(char);
            }
            index++;
            continue;
        }

        if (char !== NUKTA) {
            out.push(char);
        }
        index++;
    }

    return out.join("");
}

/**
 * Code points with the three spellings Bijoy has a single code for already
 * joined: ড + ় is ড়, and ত + ্ + ZWJ is ৎ in the older Unicode spelling.
 */
function toCodePoints(text: string): string[] {
    const source = [...text];
    const chars: string[] = [];

    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];

        if (next === NUKTA && NUKTA_LETTERS[char] !== undefined) {
            chars.push(NUKTA_LETTERS[char]);
            index++;
        } else if (char === "ত" && next === HASANT && source[index + 2] === ZWJ) {
            chars.push("ৎ");
            index += 2;
        } else {
            chars.push(char);
        }
    }

    return chars;
}

function writeSyllable(
    chars: readonly string[],
    start: number,
    out: string[],
    wordStart: boolean,
): number {
    let index = start;
    let reph = false;

    if (chars[index] === RA && chars[index + 1] === HASANT) {
        if (isConsonant(chars[index + 2])) {
            reph = true;
            index += 2;
        } else if (chars[index + 2] === ZWJ && isConsonant(chars[index + 3])) {
            reph = true;
            index += 3;
        }
    }

    const cluster = [chars[index]];
    index++;
    let finalHasant = false;

    for (;;) {
        const char = chars[index];

        if (char === HASANT) {
            if (isConsonant(chars[index + 1])) {
                cluster.push(chars[index + 1]);
                index += 2;
                continue;
            }

            finalHasant = true;
            index += chars[index + 1] === ZWNJ || chars[index + 1] === ZWJ ? 2 : 1;
            break;
        }

        // র‍্য — ra, joiner, ya-phala — is ra with a ya-phala, not a reph.
        if (char === ZWJ && chars[index + 1] === HASANT && isConsonant(chars[index + 2])) {
            cluster.push(chars[index + 2]);
            index += 3;
            continue;
        }

        break;
    }

    let kar: string | null = null;
    let modifiers = "";

    if (!finalHasant) {
        if (chars[index] === CHANDRABINDU && isKar(chars[index + 1])) {
            kar = chars[index + 1];
            modifiers = "u";
            index += 2;
        } else if (isKar(chars[index])) {
            kar = chars[index];
            index++;
        }
    }

    while (chars[index] === ANUSVARA || chars[index] === VISARGA || chars[index] === CHANDRABINDU) {
        modifiers += UNICODE_SIGNS[chars[index]];
        index++;
    }

    out.push(syllable(cluster, reph, kar, modifiers, finalHasant, wordStart));

    return index;
}

function syllable(
    cluster: readonly string[],
    reph: boolean,
    kar: string | null,
    modifiers: string,
    finalHasant: boolean,
    wordStart: boolean,
): string {
    const glyphs = clusterGlyphs(cluster);
    const last = glyphs[glyphs.length - 1];
    // A ya-phala hangs off the glyph before it, and so does the vowel sign.
    const endsInYa = glyphs.length > 1 && last.code === UNICODE_SECOND_HALVES["য"];
    const carrier = endsInYa ? glyphs[glyphs.length - 2] : last;
    const carrierConsonant = endsInYa ? cluster[cluster.length - 2] : cluster[cluster.length - 1];
    const wide = WIDE_STEM_CONSONANTS.has(carrierConsonant);
    const carriesRa = carrierConsonant === RA && RA_GLYPHS.has(carrier.code.at(-1) ?? "");

    let pre = "";
    let post = "";

    switch (kar) {
        case null:
            break;
        case I_KAR:
            pre = "w";
            break;
        case E_KAR:
            pre = wordStart ? "\u2020" : "\u2021";
            break;
        case O_KAR:
            pre = wordStart ? "\u2020" : "\u2021";
            post = "v";
            break;
        case AU_KAR:
            pre = wordStart ? "\u2020" : "\u2021";
            post = "\u0160";
            break;
        case AI_KAR:
            pre = wordStart ? "\u02C6" : "\u2030";
            break;
        case AA_KAR:
            post = "v";
            break;
        case II_KAR:
            post = "x";
            break;
        case AU_LENGTH_MARK:
            post = "\u0160";
            break;
        case U_KAR:
            post = uKar(cluster, carrier, carrierConsonant, endsInYa, carriesRa, wide);
            break;
        case UU_KAR:
            post = carriesRa ? "\u0192" : "~";
            break;
        case RI_KAR:
            if (carrier.kind === "full" && carrier.code === "n") {
                carrier.code = "\u00FC"; // হৃ
            } else {
                post = wide ? "\u201E" : "\u2026";
            }
            break;
        default:
            post = kar;
            break;
    }

    const belowKar = kar === U_KAR || kar === UU_KAR || kar === RI_KAR;
    let body = "";

    for (const [position, glyph] of glyphs.entries()) {
        // ু ূ ৃ sit under the consonant, not under the ya-phala beside it.
        if (endsInYa && belowKar && position === glyphs.length - 1) {
            body += post;
            post = "";
        }
        body += glyph.code;
    }

    // The reph is typed straight after its cluster and before any vowel sign
    // that follows — নির্বাচন is wbe©vPb, কর্তৃক is KZ©„K. See the case study for
    // the converter that puts it after the sign instead.
    return `${pre}${body}${reph ? "\u00A9" : ""}${post}${modifiers}${finalHasant ? "&" : ""}`;
}

/**
 * Which ু to draw. Four consonants fuse with it into a glyph of their own, র
 * takes a shape that hooks under its tail, and the rest pick the wide or
 * narrow sign by the stem above them.
 */
function uKar(
    cluster: readonly string[],
    carrier: Glyph,
    carrierConsonant: string,
    endsInYa: boolean,
    carriesRa: boolean,
    wide: boolean,
): string {
    if (carrier.kind === "full") {
        const fused = { M: "\u00B8", k: "\u00EF", n: "\u00FB" }[carrier.code];

        if (fused !== undefined) {
            carrier.code = fused;

            return "";
        }
    }

    // স্তু ন্তু: the ত half takes ‘, which is ্ত and ু drawn together.
    if (
        !endsInYa &&
        carrierConsonant === "ত" &&
        carrier.kind !== "full" &&
        carrier.code.length <= 2 &&
        (carrier.code.endsWith("\u00CD") || carrier.code.endsWith("\u2014"))
    ) {
        carrier.code = `${carrier.code.slice(0, -1)}\u2018`;

        return "";
    }

    if (carriesRa) {
        return "\u00E6";
    }

    if (carrierConsonant === "\u09DC" || carrierConsonant === "\u09DD") {
        return "z";
    }

    if (!endsInYa && cluster.length >= 2 && cluster.at(-2) === "ষ" && carrierConsonant === "ণ") {
        return "z";
    }

    return wide ? "y" : "z";
}

/** A vowel sign with no consonant before it, drawn on its own. */
function strayKar(kar: string, wordStart: boolean): string {
    switch (kar) {
        case AA_KAR:
            return "v";
        case I_KAR:
            return "w";
        case II_KAR:
            return "x";
        case U_KAR:
            return "y";
        case UU_KAR:
            return "~";
        case RI_KAR:
            return "\u2026";
        case E_KAR:
            return wordStart ? "\u2020" : "\u2021";
        case AI_KAR:
            return wordStart ? "\u02C6" : "\u2030";
        case O_KAR:
            return "\u2021v";
        case AU_KAR:
            return "\u2021\u0160";
        case AU_LENGTH_MARK:
            return "\u0160";
        default:
            return kar;
    }
}

function firstHalf(consonant: string, next: string): string | undefined {
    if (consonant === "ন") {
        return next === "ত" || next === "থ" || next === "ব" ? "\u0161" : "\u203A";
    }

    if (consonant === "দ") {
        return next === "ভ" ? "\u2122" : "\u02DC";
    }

    return UNICODE_FIRST_HALVES[consonant];
}

/** The second-half code for `key`, in the variant the glyph before it needs. */
function secondHalf(key: string, previous: Glyph): string | undefined {
    const base = UNICODE_SECOND_HALVES[key];

    if (base === undefined) {
        return undefined;
    }

    switch (key) {
        case "ব":
            if (previous.kind === "half") {
                return "^";
            }
            if (previous.kind !== "full") {
                return "\u00A1";
            }
            if ("সষমনদণ".includes(previous.consonant)) {
                return "^";
            }
            if ("ধবহ".includes(previous.consonant)) {
                return "\u0178";
            }
            if ("শগপল".includes(previous.consonant)) {
                return "\u00A6";
            }
            return "\u00A1";
        case "ম":
            return previous.kind === "half" ? "\u00A7" : "\u00A5";
        case "র":
            if (previous.kind === "full" && (previous.code === "c" || previous.code === "M")) {
                return "\u00D6";
            }
            if (previous.kind === "full" && previous.code === "d") {
                return "\u00AB";
            }
            return "\u00AA";
        case "ত":
            return previous.kind === "half" ? "\u00CD" : "\u2014";
        default:
            return base;
    }
}

/**
 * A cluster of consonants as the glyphs that draw it.
 *
 * Greedy, left to right: the longest ligature the font has, else a half-form
 * waiting for the next consonant, else a full glyph with second-half forms
 * hung off it. A pair the font has no shape for at all is written with an
 * explicit hasant, which every SutonnyMJ cut can draw.
 */
function clusterGlyphs(cluster: readonly string[]): Glyph[] {
    const glyphs: Glyph[] = [];
    let position = 0;
    let fresh = true;

    while (position < cluster.length) {
        if (fresh) {
            const ligature = matchLigature(cluster, position);

            if (ligature !== null) {
                glyphs.push({
                    code: ligature.code,
                    kind: "ligature",
                    consonant: cluster[position + ligature.length - 1],
                });
                position += ligature.length;
                fresh = false;
                continue;
            }

            const consonant = cluster[position];
            const next = cluster[position + 1];

            if (next !== undefined) {
                const afterNext = cluster[position + 2];
                const nextHasSecondHalf =
                    UNICODE_SECOND_HALVES[next] !== undefined ||
                    (afterNext !== undefined &&
                        UNICODE_SECOND_HALVES[`${next}${HASANT}${afterNext}`] !== undefined);

                const half = nextHasSecondHalf ? undefined : firstHalf(consonant, next);

                if (half !== undefined) {
                    glyphs.push({ code: half, kind: "half", consonant });
                    position++;
                    continue;
                }
            }

            glyphs.push({ code: UNICODE_LETTERS[consonant] ?? consonant, kind: "full", consonant });
            position++;
            fresh = false;
            continue;
        }

        const previous = glyphs[glyphs.length - 1];
        const pair =
            position + 1 < cluster.length
                ? `${cluster[position]}${HASANT}${cluster[position + 1]}`
                : undefined;
        const pairCode = pair === undefined ? undefined : secondHalf(pair, previous);

        if (pairCode !== undefined) {
            glyphs.push({ code: pairCode, kind: "second", consonant: cluster[position + 1] });
            position += 2;
            continue;
        }

        const code = secondHalf(cluster[position], previous);

        if (code !== undefined) {
            glyphs.push({ code, kind: "second", consonant: cluster[position] });
            position++;
            continue;
        }

        glyphs.push({ code: "&", kind: "hasant", consonant: "" });
        fresh = true;
    }

    return glyphs;
}

function matchLigature(
    cluster: readonly string[],
    position: number,
): { readonly code: string; readonly length: number } | null {
    for (let length = Math.min(4, cluster.length - position); length >= 2; length--) {
        const key = cluster.slice(position, position + length).join(HASANT);
        const code = UNICODE_CONJUNCTS[key];

        if (code !== undefined) {
            return { code, length };
        }
    }

    return null;
}
