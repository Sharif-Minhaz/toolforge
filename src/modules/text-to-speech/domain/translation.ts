import type { SpeechLocale } from "../types";
import { splitAtBoundaries } from "./chunks";
import { MAX_SPEECH_CHARACTERS } from "./constants";
import { splitAtPauseMarkers } from "./script";

/**
 * Turning the box into another language before it is spoken, through Google
 * Translate's free `gtx` endpoint — the one the reader's own browser calls.
 *
 * Verified against the live endpoint on 2026-10-17, from a mobile network (the
 * development machine's address was already refused with a 429):
 *
 * - The answer is a JSON array. `[0]` is a list of sentence segments, each
 *   `[translated, original, …]`; `[2]` is the detected source language.
 * - Line breaks survive, inside the segment they end.
 * - **Markers do not.** `[pause 2s]` came back as `[বিরাম 2s]`. So the text is
 *   cut at every marker and only the runs between them are sent.
 * - Leading and trailing whitespace is not reliably kept, so it is held back
 *   here and put back around each translated run.
 */

export const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

/**
 * The longest `q` one request carries, measured **URL-encoded** — which is the
 * form that travels, since the endpoint was verified over `GET`. A Bangla
 * letter is nine characters encoded, so this is about 650 Bangla characters or
 * 6,000 English ones per request, keeping the whole URL under the 8 KB that
 * every server and proxy on the way accepts.
 */
export const MAX_TRANSLATE_QUERY = 6_000;

/**
 * Where Google's codes differ from the language subtag of a voice's locale.
 * Hebrew, Javanese and Filipino keep Google's legacy codes; Norwegian Bokmål
 * is plain `no`; the Chinese locales are a script choice, and Cantonese is
 * written in traditional characters; European Portuguese and the Latin
 * Inuktitut have codes of their own.
 */
const GOOGLE_CODES: Readonly<Record<string, string>> = {
    "zh-CN": "zh-CN",
    "zh-CN-liaoning": "zh-CN",
    "zh-CN-shaanxi": "zh-CN",
    "zh-TW": "zh-TW",
    "zh-HK": "zh-TW",
    "pt-PT": "pt-PT",
    "iu-Latn-CA": "iu-Latn",
    "he-IL": "iw",
    "jv-ID": "jw",
    "fil-PH": "tl",
    "nb-NO": "no",
};

/** The language Google should translate into, for the voice that will speak it. */
export function translationTargetFor(locale: SpeechLocale): string {
    return GOOGLE_CODES[locale] ?? locale.split("-")[0] ?? locale;
}

export type TranslationPiece =
    | { readonly kind: "keep"; readonly text: string }
    | {
          readonly kind: "translate";
          readonly lead: string;
          readonly text: string;
          readonly trail: string;
      };

export type TranslationPlan =
    | { readonly ok: true; readonly pieces: readonly TranslationPiece[]; readonly requests: number }
    | { readonly ok: false; readonly reason: "empty" | "too_long" };

const encodedLength = (grapheme: string) => encodeURIComponent(grapheme).length;

function wrap(run: string): TranslationPiece {
    const match = /^(\s*)([\s\S]*?)(\s*)$/u.exec(run);
    const text = match?.[2] ?? "";

    if (text.length === 0) {
        return { kind: "keep", text: run };
    }

    return { kind: "translate", lead: match?.[1] ?? "", text, trail: match?.[3] ?? "" };
}

/**
 * The box as pieces to send and pieces to keep, in order. Joining every
 * `keep` and every translated `translate` back together — whitespace around
 * each — rebuilds the text in the new language with every marker and blank
 * line where it was.
 *
 * Bounded by the same ceiling as speech: there is no reason to translate more
 * than one generation can say, and a hundred-thousand-character document from
 * the file tab would otherwise be a hundred and fifty requests.
 */
export function planTranslation(text: string): TranslationPlan {
    if (text.length > MAX_SPEECH_CHARACTERS) {
        return { ok: false, reason: "too_long" };
    }

    const pieces: TranslationPiece[] = [];

    for (const part of splitAtPauseMarkers(text)) {
        if (part.kind === "marker") {
            pieces.push({ kind: "keep", text: part.text });
            continue;
        }

        for (const run of splitAtBoundaries(part.text, encodedLength, MAX_TRANSLATE_QUERY)) {
            pieces.push(wrap(run));
        }
    }

    const requests = pieces.filter((piece) => piece.kind === "translate").length;

    return requests === 0 ? { ok: false, reason: "empty" } : { ok: true, pieces, requests };
}

export function buildTranslateUrl(text: string, target: string): string {
    const query = new URLSearchParams({ client: "gtx", sl: "auto", tl: target, dt: "t" });

    // `q` last and through `encodeURIComponent`, so its length is the one
    // `MAX_TRANSLATE_QUERY` measured.
    return `${TRANSLATE_ENDPOINT}?${query.toString()}&q=${encodeURIComponent(text)}`;
}

export type TranslatedRun = { readonly text: string; readonly source: string | null };

/**
 * The translation out of the endpoint's array, or `null` when the body is not
 * that shape — an HTML block page, or a format Google has changed. Read
 * defensively: every index is checked, nothing is trusted to be a string.
 */
export function readTranslation(body: unknown): TranslatedRun | null {
    if (!Array.isArray(body) || !Array.isArray(body[0])) {
        return null;
    }

    let text = "";

    for (const segment of body[0]) {
        if (Array.isArray(segment) && typeof segment[0] === "string") {
            text += segment[0];
        }
    }

    if (text.length === 0) {
        return null;
    }

    return { text, source: typeof body[2] === "string" ? body[2] : null };
}

/** Joins the plan back together, translated runs in order of appearance. */
export function assembleTranslation(
    pieces: readonly TranslationPiece[],
    translated: readonly string[],
): string {
    let index = 0;
    let out = "";

    for (const piece of pieces) {
        if (piece.kind === "keep") {
            out += piece.text;
            continue;
        }

        out += `${piece.lead}${translated[index] ?? piece.text}${piece.trail}`;
        index += 1;
    }

    return out;
}
