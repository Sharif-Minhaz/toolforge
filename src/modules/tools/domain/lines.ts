import type { NewlineSeparator } from "../types";

/**
 * Line handling shared by every text tool: splitting on whichever ending the
 * pasted text happens to use, and writing back the one the user asked for.
 */

/** MIME wraps base64 bodies at 76 characters (RFC 2045 §6.8). */
export const MIME_LINE_WIDTH = 76;

export const NEWLINE_CHARACTERS: Record<NewlineSeparator, string> = {
    lf: "\n",
    crlf: "\r\n",
    cr: "\r",
};

/** Proper names for the three endings — data, so they read the same in every locale. */
export const NEWLINE_LABELS: Record<NewlineSeparator, string> = {
    lf: "LF (Unix)",
    crlf: "CRLF (Windows)",
    cr: "CR (classic Mac)",
};

/** Any of the three line endings, whichever the pasted text happens to use. */
const ANY_NEWLINE = /\r\n|\r|\n/;

export function splitLines(text: string): string[] {
    return text.split(new RegExp(ANY_NEWLINE, "g"));
}

export function joinLines(lines: readonly string[], separator: NewlineSeparator): string {
    return lines.join(NEWLINE_CHARACTERS[separator]);
}

/** Rewrites every line ending in the text to the requested one. */
export function applyNewlines(text: string, separator: NewlineSeparator): string {
    return joinLines(splitLines(text), separator);
}

/** Breaks a single long run into fixed-width lines, for MIME bodies. */
export function wrapLines(
    text: string,
    separator: NewlineSeparator,
    width: number = MIME_LINE_WIDTH,
): string {
    if (width <= 0 || text.length <= width) {
        return text;
    }

    const chunks: string[] = [];

    for (let index = 0; index < text.length; index += width) {
        chunks.push(text.slice(index, index + width));
    }

    return joinLines(chunks, separator);
}
