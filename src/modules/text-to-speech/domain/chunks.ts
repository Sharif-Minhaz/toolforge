import { getByteLength } from "@/modules/tools/domain/byte-size";
import { escapeHtml } from "@/modules/tools/domain/html-escape";

import { MAX_CHUNK_BYTES } from "./constants";

/**
 * Cutting a run of text into pieces the service will take in one request.
 *
 * The measure is the **escaped** UTF-8 size, because that is what goes on the
 * wire: an `&` costs five bytes once it is `&amp;`, and a Bangla letter costs
 * three. Measuring the raw string would let a paragraph of ampersands through
 * at five times the size this was meant to allow.
 *
 * The cut is made at the best boundary inside the budget, in order: a line
 * break, the end of a sentence, a space — and only then mid-word. Each piece is
 * spoken as a separate request, so a cut is a place the voice resets its
 * intonation; at a full stop nobody can hear it, mid-phrase everybody can.
 *
 * It never splits a grapheme. A Bangla conjunct is several code points that
 * render and are pronounced as one — `ক্ষ` is three — and cutting between them
 * hands the service a dangling virama it will read as a different sound.
 */

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Full stops as the languages in the catalogue write them: Latin, the Bangla
 * and Devanagari dari, CJK full-width marks, the Arabic question mark, and the
 * Urdu full stop.
 */
const SENTENCE_END = /[.!?…。！？।॥؟۔]$/u;

const WHITESPACE = /^\s+$/u;

/** XML-escaped, which is the form the repository sends. */
export function escapeSpeechText(text: string): string {
    return escapeHtml(text);
}

/**
 * Control characters the service chokes on, replaced with a space — tab, line
 * feed and carriage return excepted. The same set the reference client
 * removes; a stray form feed from a PDF otherwise ends the turn with no audio.
 */
export function removeUnspeakableCharacters(text: string): string {
    let cleaned = "";

    for (const character of text) {
        cleaned += isUnspeakable(character.charCodeAt(0)) ? " " : character;
    }

    return cleaned;
}

function isUnspeakable(code: number): boolean {
    const kept = code === 0x09 || code === 0x0a || code === 0x0d;

    return (code < 0x20 && !kept) || code === 0x7f;
}

type Boundaries = { newline: number; sentence: number; space: number };

/** The last good cut in `graphemes`, each as "the piece ends before this index". */
function findBoundaries(graphemes: readonly string[]): Boundaries {
    const found: Boundaries = { newline: -1, sentence: -1, space: -1 };

    for (let index = 1; index < graphemes.length; index += 1) {
        const grapheme = graphemes[index];

        if (!WHITESPACE.test(grapheme)) {
            continue;
        }

        found.space = index;

        if (grapheme.includes("\n")) {
            found.newline = index;
        }

        if (SENTENCE_END.test(graphemes[index - 1])) {
            found.sentence = index;
        }
    }

    return found;
}

function bestCut(graphemes: readonly string[]): number {
    const { newline, sentence, space } = findBoundaries(graphemes);

    for (const candidate of [newline, sentence, space]) {
        if (candidate > 0) {
            return candidate;
        }
    }

    return graphemes.length;
}

/**
 * Cuts `text` into pieces whose `measure` stays within `max`, at the best
 * boundary each time, **without losing a character**: the pieces joined back
 * together are the text exactly, whitespace and all. Speech trims what it gets;
 * translation has to put every line break back where it was.
 *
 * A single grapheme larger than the budget — only possible with hundreds of
 * stacked combining marks — becomes a piece of its own rather than an infinite
 * loop; the text box's own ceiling bounds how large that can be.
 */
export function splitAtBoundaries(
    text: string,
    measure: (grapheme: string) => number,
    max: number,
): string[] {
    const pieces: string[] = [];
    let current: string[] = [];
    let currentSize = 0;

    for (const { segment } of GRAPHEMES.segment(text)) {
        const size = measure(segment);

        if (currentSize + size > max && current.length > 0) {
            const cut = bestCut(current);

            pieces.push(current.slice(0, cut).join(""));
            current = current.slice(cut);
            currentSize = current.reduce((total, grapheme) => total + measure(grapheme), 0);
        }

        current.push(segment);
        currentSize += size;
    }

    if (current.length > 0) {
        pieces.push(current.join(""));
    }

    return pieces;
}

const escapedBytes = (grapheme: string) => getByteLength(escapeSpeechText(grapheme));

/** The text as pieces no larger than `maxBytes` once escaped, trimmed, blank pieces dropped. */
export function chunkSpeechText(text: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
    return splitAtBoundaries(text, escapedBytes, maxBytes)
        .map((piece) => piece.trim())
        .filter((piece) => piece.length > 0);
}
