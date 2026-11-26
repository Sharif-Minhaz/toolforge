import type { LetterCase } from "../types";

/**
 * Capitalises after a space and after a hyphen, so "twenty-five" becomes
 * "Twenty-Five" — except "and", which stays small the way it does in every
 * title-cased cheque: "One Hundred and Five Taka Only".
 */
function titleCase(text: string): string {
    return text.replace(/(^|[\s-])([a-z]+)/g, (_, boundary: string, word: string) => {
        if (word === "and" && boundary !== "") {
            return `${boundary}${word}`;
        }

        return `${boundary}${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    });
}

/** The English line, in the case the reader picked. The words are built lower-case. */
export function applyLetterCase(text: string, letterCase: LetterCase): string {
    switch (letterCase) {
        case "lower":
            return text;
        case "sentence":
            return text.charAt(0).toUpperCase() + text.slice(1);
        case "title":
            return titleCase(text);
        case "upper":
            return text.toUpperCase();
    }
}
