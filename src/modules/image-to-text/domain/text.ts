/** Han, kana, CJK punctuation and full-width forms: scripts written without spaces. */
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯`;

const SPACE_BETWEEN_CJK = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, "gu");

/**
 * Tesseract's text, made into something a reader would paste.
 *
 * - Chinese and Japanese come back with a space between every character —
 *   `这 是 中 文` — because the engine segments them as one-letter words.
 *   Spaces between two such characters are removed; a space between `東京`
 *   and `Tower` is kept.
 * - The form feed that ends a page, trailing spaces, Windows line ends and
 *   runs of blank lines are noise from the layout analysis, not the picture.
 */
export function tidyRecognizedText(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/\f/g, "")
        .replace(SPACE_BETWEEN_CJK, "$1")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type TextCounts = {
    /** In characters, not UTF-16 code units, so `日本` and an emoji count right. */
    readonly characters: number;
    readonly lines: number;
};

export function countText(text: string): TextCounts {
    if (text.length === 0) {
        return { characters: 0, lines: 0 };
    }

    return { characters: [...text].length, lines: text.split("\n").length };
}
