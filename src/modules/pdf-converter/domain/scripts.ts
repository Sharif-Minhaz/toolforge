import { PDF_SCRIPTS, type PdfScript } from "../types";

/**
 * Which writing system a codepoint belongs to, for the one question this tool
 * has to answer about it: is there a font on this site that can draw it?
 *
 * Ranges rather than `Intl` or a property escape, and deliberately so. A
 * runtime enumeration is a capability probe wearing a disguise — Bun, Node and
 * every browser disagree about the exact contents of Unicode property tables,
 * and a document that reports two unsupported scripts on the server and three
 * in the browser would be a hydration mismatch as well as a wrong answer. This
 * table is frozen data; it says the same thing everywhere.
 *
 * The list is not all of Unicode. It is every block this site either has a font
 * for or expects to meet, and everything else lands in `other` — which is still
 * a reportable answer, just a less specific one.
 */
type ScriptRange = readonly [start: number, end: number, script: PdfScript];

const RANGES: readonly ScriptRange[] = [
    // Latin, and the punctuation and symbols that travel with it. Roboto
    // carries Greek and Cyrillic too, so they are one decision, not three.
    [0x0000, 0x02ff, "latin"],
    [0x0300, 0x036f, "latin"], // combining diacritics
    [0x0370, 0x03ff, "latin"], // Greek
    [0x0400, 0x052f, "latin"], // Cyrillic and its supplement
    [0x0590, 0x05ff, "hebrew"],
    [0x0600, 0x06ff, "arabic"],
    [0x0750, 0x077f, "arabic"],
    [0x0900, 0x097f, "devanagari"],
    [0x0980, 0x09ff, "bengali"],
    [0x0e00, 0x0e7f, "thai"],
    [0x1e00, 0x1eff, "latin"], // Latin Extended Additional
    [0x2000, 0x206f, "latin"], // general punctuation
    [0x20a0, 0x20bf, "latin"], // currency
    [0x2100, 0x27bf, "latin"], // letterlike, arrows, maths, symbols
    [0x2e80, 0x303f, "cjk"], // radicals and CJK punctuation
    [0x3040, 0x30ff, "cjk"], // kana
    [0x3100, 0x312f, "cjk"], // bopomofo
    [0x3130, 0x318f, "hangul"],
    [0x3400, 0x4dbf, "cjk"], // extension A
    [0x4e00, 0x9fff, "cjk"], // unified ideographs
    [0xa960, 0xa97f, "hangul"],
    [0xac00, 0xd7af, "hangul"],
    [0xf900, 0xfaff, "cjk"], // compatibility ideographs
    [0xfb50, 0xfdff, "arabic"], // presentation forms A
    [0xfe70, 0xfeff, "arabic"], // presentation forms B
    [0xff00, 0xffef, "cjk"], // half- and full-width forms
];

/**
 * Characters that belong to whatever is around them.
 *
 * A space, a tab, a newline and the two zero-width joiners carry no script of
 * their own. Classifying them would break a Bengali word in half at every
 * joiner — and `ZWNJ` inside a conjunct is exactly where that would hurt.
 *
 * The danda and double danda are here for a different reason, and it cost a
 * rendered page to find. Unicode files them in the *Devanagari* block, but they
 * are the full stop of Bengali, Odia, Gurmukhi and a dozen more — Unicode calls
 * the script `Common`. Classified by their block they resolve to Roboto, which
 * has no glyph for either, so every Bengali sentence ended in an empty box.
 * Treated as neutral they take the font of the sentence they close, which is
 * the one that can draw them.
 */
const NEUTRAL = new Set([
    0x0009, 0x000a, 0x000d, 0x0020, 0x00a0, 0x200b, 0x200c, 0x200d, 0xfeff, 0x0964, 0x0965,
]);

export function isNeutralCodepoint(codepoint: number): boolean {
    return NEUTRAL.has(codepoint);
}

export function scriptOfCodepoint(codepoint: number): PdfScript {
    for (const [start, end, script] of RANGES) {
        if (codepoint >= start && codepoint <= end) {
            return script;
        }
    }

    return "other";
}

/**
 * Scripts this site can actually draw.
 *
 * `latin` is Roboto, which pdfmake carries. `bengali` is the Noto pack fetched
 * from `/fonts` the first time a document needs it. Anything else is a gap the
 * reader is told about — not a silent page of empty boxes.
 */
const DRAWABLE: ReadonlySet<PdfScript> = new Set<PdfScript>(["latin", "bengali"]);

export function isDrawableScript(script: PdfScript): boolean {
    return DRAWABLE.has(script);
}

/**
 * Every script present in a string, in the fixed order of `PDF_SCRIPTS` rather
 * than the order they happened to appear.
 *
 * A stable order matters: this feeds a sentence the reader sees, and a notice
 * that reorders itself between two conversions of the same document reads as a
 * different notice.
 */
export function scriptsIn(text: string): readonly PdfScript[] {
    const found = new Set<PdfScript>();

    for (const character of text) {
        const codepoint = character.codePointAt(0);

        if (codepoint === undefined || isNeutralCodepoint(codepoint)) {
            continue;
        }

        found.add(scriptOfCodepoint(codepoint));
    }

    return PDF_SCRIPTS.filter((script) => found.has(script));
}

/** The subset of `scriptsIn` that no bundled font can draw. */
export function unsupportedScriptsIn(text: string): readonly PdfScript[] {
    return scriptsIn(text).filter((script) => !isDrawableScript(script));
}
