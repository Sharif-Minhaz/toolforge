/**
 * What every SutonnyMJ code means, in both directions.
 *
 * Bijoy is not an encoding of Bangla. It is a font trick: the Bangla glyphs are
 * drawn in the slots a Western font keeps for Latin letters and Windows-1252
 * punctuation, so the file underneath says `Avgvi †mvbvi evsjv` and only the
 * font turns it into আমার সোনার বাংলা. The text is stored in the order the
 * glyphs are *drawn*, left to right, rather than the order the language is
 * *spoken* — which is the whole of what the reordering pass in `to-unicode.ts`
 * undoes.
 *
 * There is no published specification. The table was assembled from the
 * SutonnyMJ code chart as two independent converters record it —
 * `bijoy2unicode`, and `@kovapdf/bijoy-unicode`, which cites Avro's font table
 * and Gazette documents for its choices — and every place the two disagree is
 * decided in a comment beside the entry. See
 * `docs/case-studies/bijoy-unicode.md`. Keys above U+007F are written as
 * escapes, because half of them are invisible or look like their neighbours.
 */

/**
 * The Bangla reading of every code, before context is consulted.
 *
 * About a third of these have a second, non-Bangla reading — `’` is ্থ after a
 * half-form and a closing quote anywhere else — and `to-unicode.ts` decides
 * between the two. The reading here is the Bangla one, which is also what
 * decides whether a code can begin a letter.
 */
export const BIJOY_GLYPHS: Readonly<Record<string, string>> = {
    // Independent vowels. `Av` is আ and is matched as a pair before `A`.
    A: "অ",
    B: "ই",
    C: "ঈ",
    D: "উ",
    E: "ঊ",
    F: "ঋ",
    G: "এ",
    H: "ঐ",
    I: "ও",
    J: "ঔ",

    // Consonants.
    K: "ক",
    L: "খ",
    M: "গ",
    N: "ঘ",
    O: "ঙ",
    P: "চ",
    Q: "ছ",
    R: "জ",
    S: "ঝ",
    T: "ঞ",
    U: "ট",
    V: "ঠ",
    W: "ড",
    X: "ঢ",
    Y: "ণ",
    Z: "ত",
    _: "থ",
    "`": "দ",
    a: "ধ",
    b: "ন",
    c: "প",
    d: "ফ",
    e: "ব",
    f: "ভ",
    g: "ম",
    h: "য",
    i: "র",
    j: "ল",
    k: "শ",
    l: "ষ",
    m: "স",
    n: "হ",
    o: "\u09DC", // ড়
    p: "\u09DD", // ঢ়
    q: "\u09DF", // য়

    // Signs.
    r: "ৎ",
    s: "ং",
    t: "ঃ",
    u: "ঁ",

    // Digits. A Bijoy document has no Western digits at all — every one of
    // them is drawn as a Bangla numeral by the font.
    "0": "০",
    "1": "১",
    "2": "২",
    "3": "৩",
    "4": "৪",
    "5": "৫",
    "6": "৬",
    "7": "৭",
    "8": "৮",
    "9": "৯",

    // Vowel signs. Several glyphs per sign, because the font has a narrow and
    // a wide one to sit under different stems; the meaning is the same.
    v: "া",
    w: "ি",
    x: "ী",
    y: "ু", // under the wide stems
    z: "ু", // under the narrow ones
    "~": "ূ",
    "\u0192": "ূ", // ƒ — under র, as in রূপ iƒc
    "\u201A": "ূ", // ‚ — classic narrow ূ
    "\u201E": "ৃ", // „ — wide
    "\u2026": "ৃ", // … — narrow
    "\u2020": "ে", // † — the glyph used at the start of a word
    "\u2021": "ে", // ‡ — the one used inside a word
    "\u02C6": "ৈ", // ˆ — word start
    "\u2030": "ৈ", // ‰ — inside a word
    "\u0160": "ৗ", // Š — the au length mark; ‡ + cluster + Š is ৌ
    "\u201C": "ু", // “ — a ু variant after a consonant; an opening quote otherwise
    "\u2013": "ু", // – — likewise; an en dash otherwise

    // A consonant and its vowel sign drawn as one glyph.
    "\u00B8": "গু", // ¸
    "\u00EF": "শু", // ï
    "\u00FB": "হু", // û
    "\u00FC": "হৃ", // ü
    // æ is ু under র (রু = iæ) and ম্ন after anything else (নিম্ন = wbæ). The
    // older table in `bijoy2unicode` reads it as ু everywhere, which turns
    // নিম্নলিখিত into নিুলিখিত.
    "\u00E6": "ম্ন",

    // Punctuation.
    "|": "\u0964",
    "\\": "\u0965",
    $: "৳",
    "\u00D2": "\u201C", // Ò
    "\u00D3": "\u201D", // Ó
    "\u00D4": "\u2018", // Ô
    "\u00D5": "\u2019", // Õ — also an apostrophe inside a word: হ’ল = nÕj
    "\u00D1": "\u2014", // Ñ

    // Second-half forms: a consonant drawn beneath or after the one before it.
    // Each stands for hasant + consonant, and is only Bangla after a letter.
    "\u00A8": "্য", // ¨ — ya-phala
    "\u00AA": "্র", // ª — ra-phala, general
    "\u00D6": "্র", // Ö — ra-phala under প and গ
    "\u00AB": "্র", // « — ra-phala under ফ
    "^": "্ব", // after স ম ন ষ দ half-forms
    "\u0178": "্ব", // Ÿ — after ধ ব হ
    "\u00A1": "্ব", // ¡ — after most consonants
    "\u00A6": "্ব", // ¦ — after শ গ প ল
    "\u00A2": "্ভ", // ¢
    "\u00A3": "্ভ্র", // £
    "\u00A5": "্ম", // ¥ — after a full consonant
    "\u00A7": "্ম", // § — after a half-form
    "\u00AC": "্ল", // ¬ — classic
    "\u00AD": "্ল", // soft hyphen — the classic ্ল, invisible in most editors
    "\u0153": "্ন", // œ
    // è is ্ণ (হ্ণ nè). `bijoy2unicode` reads it as ্ন, which would give ্ন two
    // codes and ্ণ none.
    "\u00E8": "্ণ",
    "\u00FA": "্প", // ú
    "\u2039": "্ক", // ‹
    "\u0152": "্ক্র", // Œ
    "\u00BF": "্ত্র", // ¿
    "\u2018": "্তু", // ‘ — after a half-form; an opening quote otherwise
    "\u2019": "্থ", // ’ — after a half-form; a closing quote otherwise
    "\u2014": "্ত", // — — classic, after a half-form; an em dash otherwise
    "@": "্ত", // after a half-form; an at sign otherwise
    // ø is ্ল after a letter (প্লাবন cøveb) and স্ন on its own (স্নান øvb).
    "\u00F8": "স্ন",
    // Í is ত after a half-form (স্ত ¯Í) and ত্ম after a full letter (আত্মা AvÍv).
    "\u00CD": "ত্ম",

    // First-half forms: a dead consonant drawn as half a glyph, waiting for
    // the next one. Only Bangla when a letter follows.
    "\u00A4": "ম্", // ¤
    "\u00AE": "ষ্", // ®
    "\u00AF": "স্", // ¯
    "\u0161": "ন্", // š — before ত থ ব
    "\u203A": "ন্", // › — before দ ট ড
    "\u02DC": "দ্", // ˜
    "\u2122": "দ্", // ™ — before ভ
    "\u201D": "চ্", // ” — before চ ছ ঞ; a closing quote otherwise
    "\u2022": "ঙ্", // • — before খ ঘ; a bullet otherwise

    // Whole conjuncts drawn as one glyph.
    "\u00B0": "ক্ক", // °
    "\u00B1": "ক্ট", // ±
    // ² is ক্ষ্ম (সূক্ষ্ম m~², লক্ষ্মী j²x). `bijoy2unicode` reads it as ক্ষ্ণ,
    // which leaves লক্ষ্মী unspellable.
    "\u00B2": "ক্ষ্ম",
    "\u00B3": "ক্ত", // ³
    "\u00B4": "ক্ম", // ´ — Avro's table; rare in real text
    "\u00B5": "ক্র", // µ
    "\u00B6": "ক্ষ", // ¶ — the classic code
    "\u00FF": "ক্ষ", // ÿ — the modern one
    "\u00B7": "ক্স", // ·
    // ¹ is গ্গ in Avro's font table, and জ্ঞ in one older converter. জ্ঞ
    // already has Á, so the code goes to the conjunct that has no other.
    "\u00B9": "গ্গ",
    "\u00BA": "গ্দ", // º
    "\u00BB": "গ্ধ", // »
    "\u00BC": "ঙ্ক", // ¼
    "\u00BD": "ঙ্গ", // ½
    "\u00BE": "জ্জ", // ¾
    "\u00C0": "জ্ঝ", // À
    "\u00C1": "জ্ঞ", // Á
    "\u00C2": "ঞ্চ", // Â
    "\u00C3": "ঞ্ছ", // Ã
    "\u00C4": "ঞ্জ", // Ä
    "\u00C5": "ঞ্ঝ", // Å
    "\u00C6": "ট্ট", // Æ
    "\u00C7": "ড্ড", // Ç
    "\u00C8": "ণ্ট", // È
    "\u00C9": "ণ্ঠ", // É
    "\u00CA": "ণ্ড", // Ê — classic
    "\u00D0": "ণ্ড", // Ð — modern; an en dash when no Bangla precedes it
    "\u00CB": "ত্ত", // Ë
    "\u00CC": "ত্থ", // Ì
    "\u00CE": "ত্র", // Î
    "\u00CF": "দ্দ", // Ï
    "\u00D7": "দ্ধ", // ×
    "\u00D8": "দ্ব", // Ø
    "\u00D9": "দ্ম", // Ù
    "\u00DA": "ন্ঠ", // Ú
    "\u00DB": "ন্ড", // Û
    "\u00DC": "ন্ধ", // Ü
    "\u00DD": "ন্স", // Ý
    "\u00DE": "প্ট", // Þ
    "\u00DF": "প্ত", // ß
    "\u00E0": "প্প", // à
    "\u00E1": "প্স", // á
    "\u00E2": "ব্জ", // â
    "\u00E3": "ব্দ", // ã
    "\u00E4": "ব্ধ", // ä
    "\u00E5": "ভ্র", // å
    "\u00E7": "ম্ফ", // ç
    "\u00E9": "ল্ক", // é
    "\u00EA": "ল্গ", // ê
    "\u00EB": "ল্ট", // ë
    "\u00EC": "ল্ড", // ì
    "\u00ED": "ল্প", // í
    "\u00EE": "ল্ফ", // î
    "\u00F0": "শ্চ", // ð
    "\u00F1": "শ্ছ", // ñ
    "\u00F2": "ষ্ণ", // ò
    "\u00F3": "ষ্ট", // ó
    "\u00F4": "ষ্ঠ", // ô
    "\u00F5": "ষ্ফ", // õ
    "\u00F6": "স্খ", // ö
    "\u00F7": "স্ট", // ÷ — a division sign between two numbers
    "\u00F9": "স্ফ", // ù
    "\u00FD": "হ্ন", // ý
    "\u00FE": "হ্ম", // þ
};

/** The reph, ©: র্ drawn above the letter it precedes, but typed after it. */
export const BIJOY_REPH = "\u00A9";

/** The explicit hasant, &. */
export const BIJOY_HASANT = "&";

/** Codes that mean hasant + consonant, and so need a letter before them. */
export const SECOND_HALF_CODES: ReadonlySet<string> = new Set([
    "\u00A8",
    "\u00AA",
    "\u00D6",
    "\u00AB",
    "^",
    "\u0178",
    "\u00A1",
    "\u00A6",
    "\u00A2",
    "\u00A3",
    "\u00A5",
    "\u00A7",
    "\u00AC",
    "\u00AD",
    "\u0153",
    "\u00E8",
    "\u00FA",
    "\u2039",
    "\u0152",
    "\u00BF",
]);

/** Codes that mean consonant + hasant, and so need a letter after them. */
export const FIRST_HALF_CODES: ReadonlySet<string> = new Set([
    "\u00A4",
    "\u00AE",
    "\u00AF",
    "\u0161",
    "\u203A",
    "\u02DC",
    "\u2122",
]);

/**
 * Conjunct codes that are also everyday symbols written after a number — `30°`,
 * `5×3`, `10²` — and read as the symbol when a digit comes first.
 */
export const DIGIT_SYMBOL_CODES: ReadonlySet<string> = new Set([
    "\u00D7",
    "\u00B1",
    "\u00B0",
    "\u00B5",
    "\u00B9",
    "\u00B2",
    "\u00B3",
    "\u00BC",
    "\u00BD",
    "\u00BE",
]);

/** The same codes, read as a symbol when they stand alone between spaces. */
export const STANDALONE_SYMBOL_CODES: ReadonlySet<string> = new Set([
    "\u00B7",
    "\u00B0",
    "\u00B1",
    "\u00D7",
    "\u00F7",
    "\u00B9",
    "\u00B2",
    "\u00B3",
    "\u00BC",
    "\u00BD",
    "\u00BE",
    "\u00BB",
    "\u00A7",
    "\u00B6",
]);

/**
 * The Windows-1252 characters a Bijoy file holds in 0x80–0x9F, by byte.
 *
 * Text that went through a Latin-1 decoder on its way here carries those bytes
 * as the C1 control characters U+0080–U+009F instead, and every glyph in that
 * row — ে, ৈ, ্ক, চ্ — would otherwise be lost. Empty slots are bytes 1252
 * leaves undefined.
 */
export const CP1252_HIGH_ROW: readonly string[] = [
    "\u20AC",
    "",
    "\u201A",
    "\u0192",
    "\u201E",
    "\u2026",
    "\u2020",
    "\u2021",
    "\u02C6",
    "\u2030",
    "\u0160",
    "\u2039",
    "\u0152",
    "",
    "\u017D",
    "",
    "",
    "\u2018",
    "\u2019",
    "\u201C",
    "\u201D",
    "\u2022",
    "\u2013",
    "\u2014",
    "\u02DC",
    "\u2122",
    "\u0161",
    "\u203A",
    "\u0153",
    "",
    "\u017E",
    "\u0178",
];

// ---------------------------------------------------------------------------
// Unicode → Bijoy
// ---------------------------------------------------------------------------

/** Independent vowels, and every consonant drawn as a full glyph. */
export const UNICODE_LETTERS: Readonly<Record<string, string>> = {
    অ: "A",
    আ: "Av",
    ই: "B",
    ঈ: "C",
    উ: "D",
    ঊ: "E",
    ঋ: "F",
    এ: "G",
    ঐ: "H",
    ও: "I",
    ঔ: "J",
    ক: "K",
    খ: "L",
    গ: "M",
    ঘ: "N",
    ঙ: "O",
    চ: "P",
    ছ: "Q",
    জ: "R",
    ঝ: "S",
    ঞ: "T",
    ট: "U",
    ঠ: "V",
    ড: "W",
    ঢ: "X",
    ণ: "Y",
    ত: "Z",
    থ: "_",
    দ: "`",
    ধ: "a",
    ন: "b",
    প: "c",
    ফ: "d",
    ব: "e",
    ভ: "f",
    ম: "g",
    য: "h",
    র: "i",
    ল: "j",
    শ: "k",
    ষ: "l",
    স: "m",
    হ: "n",
    "\u09DC": "o",
    "\u09DD": "p",
    "\u09DF": "q",
};

/** Everything that is neither a letter nor a vowel sign. */
export const UNICODE_SIGNS: Readonly<Record<string, string>> = {
    ৎ: "r",
    "ং": "s",
    "ঃ": "t",
    "ঁ": "u",
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9",
    "\u0964": "|",
    "\u0965": "\\",
    "৳": "$",
    // In SutonnyMJ the curly quotes, the dashes and the ellipsis are not
    // punctuation at all — they are ু, চ্, ্তু, ্থ, ্ত and ৃ. Each is rewritten
    // to the code the font draws as that punctuation.
    "\u201C": "\u00D2",
    "\u201D": "\u00D3",
    "\u2018": "\u00D4",
    "\u2019": "\u00D5",
    "\u2013": "\u00D1",
    "\u2014": "\u00D1",
    "\u2026": "...",
};

/**
 * Conjuncts the font draws as one glyph, or as a pair that is not simply a
 * half-form plus a second half. Keys are consonants joined by hasant. Longest
 * match wins, so স্ত্র beats স্ত.
 */
export const UNICODE_CONJUNCTS: Readonly<Record<string, string>> = {
    ক্ক: "\u00B0",
    ক্ট: "\u00B1",
    ক্ত: "\u00B3",
    ক্র: "\u00B5",
    ক্স: "\u00B7",
    ক্ষ: "\u00FF",
    ক্ষ্ম: "\u00B2",
    // ´ is in Avro's chart but uncertain in real documents; the full ক with a
    // second-half ম draws the same conjunct without depending on it.
    ক্ম: "K\u00A5",
    গ্ধ: "\u00BB",
    গ্গ: "\u00B9",
    গ্দ: "\u00BA",
    ঙ্ক: "\u00BC",
    ঙ্গ: "\u00BD",
    ঙ্খ: "\u2022L",
    ঙ্ঘ: "\u2022N",
    ঙ্ক্ষ: "\u2022\u00FF",
    চ্চ: "\u201DP",
    চ্ছ: "\u201DQ",
    চ্ছ্ব: "\u201DQ\u00A1",
    চ্ঞ: "\u201DT",
    জ্জ: "\u00BE",
    জ্জ্ব: "\u00BE\u00A1",
    জ্ঝ: "\u00C0",
    জ্ঞ: "\u00C1",
    ঞ্চ: "\u00C2",
    ঞ্ছ: "\u00C3",
    ঞ্জ: "\u00C4",
    ঞ্ঝ: "\u00C5",
    ট্ট: "\u00C6",
    ড্ড: "\u00C7",
    ণ্ট: "\u00C8",
    ণ্ঠ: "\u00C9",
    ণ্ড: "\u00D0",
    ত্ত: "\u00CB",
    ত্ত্ব: "\u00CB\u00A1",
    ত্থ: "\u00CC",
    ত্র: "\u00CE",
    ত্ম: "Z\u00A5",
    দ্দ: "\u00CF",
    দ্ধ: "\u00D7",
    দ্ব: "\u00D8",
    দ্ম: "\u00D9",
    দ্ভ: "\u2122\u00A2",
    দ্গ: "\u02DCM",
    দ্ঘ: "\u02DCN",
    ন্ঠ: "\u00DA",
    ন্ড: "\u00DB",
    ন্ধ: "\u00DC",
    ন্স: "\u00DD",
    ন্ত: "\u0161\u00CD",
    ন্ত্র: "\u0161\u00BF",
    ন্থ: "\u0161\u2019",
    ন্দ: "\u203A`",
    ন্ট: "\u203AU",
    ন্ব: "\u0161^",
    ন্দ্ব: "\u203A\u00D8",
    ন্ত্ব: "\u0161\u00CD\u00A1",
    প্ট: "\u00DE",
    প্ত: "\u00DF",
    প্প: "\u00E0",
    প্স: "\u00E1",
    ব্জ: "\u00E2",
    ব্দ: "\u00E3",
    ব্ধ: "\u00E4",
    ভ্র: "\u00E5",
    ম্ন: "g\u0153",
    ম্ফ: "\u00E7",
    ম্প: "\u00A4\u00FA",
    ম্ব: "\u00A4^",
    ম্ভ: "\u00A4\u00A2",
    ম্ভ্র: "\u00A4\u00A3",
    ম্ম: "\u00A4\u00A7",
    ম্ল: "\u00A4\u00F8",
    ল্ক: "\u00E9",
    ল্গ: "\u00EA",
    ল্ট: "\u00EB",
    ল্ড: "\u00EC",
    ল্প: "\u00ED",
    ল্ফ: "\u00EE",
    শ্চ: "\u00F0",
    শ্ছ: "\u00F1",
    ষ্ণ: "\u00F2",
    ষ্ট: "\u00F3",
    ষ্ঠ: "\u00F4",
    ষ্ফ: "\u00F5",
    ষ্ক: "\u00AE\u2039",
    ষ্প: "\u00AE\u00FA",
    ষ্ম: "\u00AE\u00A7",
    ষ্ক্র: "\u00AE\u0152",
    স্খ: "\u00F6",
    স্ট: "\u00F7",
    স্ফ: "\u00F9",
    স্ক: "\u00AF\u2039",
    স্ক্র: "\u00AF\u0152",
    স্ত: "\u00AF\u00CD",
    স্ত্র: "\u00AF\u00BF",
    স্থ: "\u00AF\u2019",
    স্প: "\u00AF\u00FA",
    স্ব: "\u00AF^",
    স্ম: "\u00AF\u00A7",
    স্ল: "\u00AF\u00F8",
    হ্ন: "\u00FD",
    হ্ম: "\u00FE",
};

/** Consonants that have a half-form to stand before a second consonant. */
export const UNICODE_FIRST_HALVES: Readonly<Record<string, string>> = {
    ম: "\u00A4",
    ষ: "\u00AE",
    স: "\u00AF",
    চ: "\u201D",
    ঙ: "\u2022",
    ন: "\u203A",
    দ: "\u02DC",
};

/**
 * Consonants with a second-half form, by what follows the hasant. The base
 * code here is the general one; `to-bijoy.ts` picks the variant a particular
 * predecessor needs.
 */
export const UNICODE_SECOND_HALVES: Readonly<Record<string, string>> = {
    য: "\u00A8",
    র: "\u00AA",
    ব: "\u00A1",
    ম: "\u00A5",
    ল: "\u00F8",
    ন: "\u0153",
    ণ: "\u00E8",
    ক: "\u2039",
    ত: "\u00CD",
    থ: "\u2019",
    ভ: "\u00A2",
    প: "\u00FA",
    ক্র: "\u0152",
    ত্র: "\u00BF",
    ভ্র: "\u00A3",
};

/**
 * Consonants with a wide enough stem to take the wide ু (y) and ৃ („); the
 * rest take the narrow z and ….
 */
export const WIDE_STEM_CONSONANTS: ReadonlySet<string> = new Set([
    ..."খগঘণথদধনপবমযরলশষসহ",
    "\u09DF",
]);
