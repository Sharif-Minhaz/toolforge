import type { ScriptFailure } from "../types";
import { MAX_PAUSE_SECONDS, MAX_PAUSES, MIN_PAUSE_SECONDS } from "./constants";

/**
 * The one piece of syntax the text box understands: `[pause 2s]`.
 *
 * Pauses are text in the box, rather than a list kept beside it, so they
 * survive a copy, a paste and an edit the way the words around them do, and a
 * reader can see exactly where each one falls.
 *
 * **Why this exists at all.** The service accepts only the SSML Edge itself
 * sends: one `<voice>`, one `<prosody>`, plain text inside. A `<break>` was
 * refused outright on 2026-10-16 — no audio, no error, the turn simply ends.
 * So a pause cannot be asked of the service; the server splits the text at
 * each marker, speaks the pieces separately, and writes the silence itself.
 * `mp3.ts` is the other half.
 *
 * The marker is ASCII in every interface language on purpose. It is syntax,
 * like a tag, and one spelling is what makes a script portable between readers.
 */

export type ScriptPart =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "pause"; readonly seconds: number };

/**
 * `[pause 2s]`, `[Pause 0.5 s]`, `[pause 3]`. Lenient about case, spacing and a
 * missing unit — a near-miss read aloud as "pause three" is worse than a guess
 * at what was meant. Strict about the number: no sign, no exponent.
 */
const PAUSE_MARKER = /\[\s*pause\s+(\d+(?:\.\d+)?)\s*s?\s*\]/giu;

/** `0.5` → `[pause 0.5s]`. What the Pauses menu inserts. */
export function formatPauseMarker(seconds: number): string {
    return `[pause ${seconds}s]`;
}

/** 1-based position in characters, not UTF-16 units, so an emoji earlier on does not skew it. */
function characterPosition(text: string, index: number): number {
    return [...text.slice(0, index)].length + 1;
}

/**
 * Splits the box into the runs of text and the pauses between them.
 *
 * Refuses a pause outside `MIN_PAUSE_SECONDS`…`MAX_PAUSE_SECONDS` rather than
 * clamping it: `[pause 30s]` is either a typo or a request this tool cannot
 * honour, and in neither case is ten seconds what the reader asked for.
 */
export function parseScript(text: string): readonly ScriptPart[] | ScriptFailure {
    const parts: ScriptPart[] = [];
    let cursor = 0;
    let pauses = 0;

    for (const match of text.matchAll(PAUSE_MARKER)) {
        const index = match.index;
        const seconds = Number(match[1]);

        if (seconds < MIN_PAUSE_SECONDS || seconds > MAX_PAUSE_SECONDS) {
            return {
                ok: false,
                reason: "pause_out_of_range",
                position: characterPosition(text, index),
            };
        }

        pauses += 1;

        if (pauses > MAX_PAUSES) {
            return {
                ok: false,
                reason: "too_many_pauses",
                position: characterPosition(text, index),
            };
        }

        if (index > cursor) {
            parts.push({ kind: "text", text: text.slice(cursor, index) });
        }

        parts.push({ kind: "pause", seconds });
        cursor = index + match[0].length;
    }

    if (cursor < text.length) {
        parts.push({ kind: "text", text: text.slice(cursor) });
    }

    return parts;
}

export type PauseInsertion = {
    readonly text: string;
    /** Where the caret belongs afterwards: just past the marker. */
    readonly caret: number;
};

/**
 * Puts a marker at the caret, replacing any selection, with a space on each
 * side only where one is missing — so pressing it three times in a row reads
 * as three markers, not as one run-on token.
 */
export function insertPauseMarker(
    text: string,
    selectionStart: number,
    selectionEnd: number,
    seconds: number,
): PauseInsertion {
    const start = Math.max(0, Math.min(selectionStart, text.length));
    const end = Math.max(start, Math.min(selectionEnd, text.length));
    const before = text.slice(0, start);
    const after = text.slice(end);

    const lead = before.length === 0 || /\s$/u.test(before) ? "" : " ";
    const trail = after.length === 0 || /^\s/u.test(after) ? "" : " ";
    const marker = `${lead}${formatPauseMarker(seconds)}${trail}`;

    return {
        text: `${before}${marker}${after}`,
        caret: before.length + lead.length + formatPauseMarker(seconds).length,
    };
}
