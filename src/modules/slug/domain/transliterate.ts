/**
 * Latin letters that survive Unicode normalisation intact.
 *
 * `NFKD` turns `é` into `e` plus a combining acute, so stripping marks handles
 * the accented range on its own. These letters have no decomposition at all —
 * `ß` is not `s` with a diacritic, it is its own letter — so dropping them
 * would quietly delete a word's worth of meaning. The map is deliberately
 * confined to the Latin script: romanising Cyrillic or Bangla is a different
 * job with per-language answers, and the ASCII switch exists so those readers
 * can keep their own letters instead.
 */
export const TRANSLITERATIONS: Record<string, string> = {
    ß: "ss",
    ẞ: "SS",
    æ: "ae",
    Æ: "AE",
    œ: "oe",
    Œ: "OE",
    ø: "o",
    Ø: "O",
    đ: "d",
    Đ: "D",
    ð: "d",
    Ð: "D",
    þ: "th",
    Þ: "TH",
    ł: "l",
    Ł: "L",
    ħ: "h",
    Ħ: "H",
    ŋ: "ng",
    Ŋ: "NG",
    ı: "i",
    ĸ: "k",
    ə: "e",
    Ə: "E",
};

// Built from the map itself, so a letter can never be listed in one and
// forgotten in the other. None of the keys mean anything special inside a
// character class.
const TRANSLITERATABLE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join("")}]`, "gu");

export function applyTransliterations(text: string): string {
    return text.replace(TRANSLITERATABLE, (character) => TRANSLITERATIONS[character] ?? character);
}
