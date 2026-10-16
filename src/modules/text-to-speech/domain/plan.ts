import type { ScriptFailure, SpeechPlan, SpeechStep } from "../types";
import { chunkSpeechText, removeUnspeakableCharacters } from "./chunks";
import { MAX_SPEECH_CHARACTERS } from "./constants";
import { parseScript } from "./script";

/**
 * The text box, turned into the list of things the server will do.
 *
 * One function for both sides. The island calls it on every settled keystroke
 * to decide whether Generate is enabled and what to say under the box; the
 * route calls it again on what arrived, because a request is not trusted for
 * having come from this page. Same input, same verdict, same reasons.
 */
export function planSpeech(text: string): SpeechPlan | ScriptFailure {
    if (text.length > MAX_SPEECH_CHARACTERS) {
        return { ok: false, reason: "too_long" };
    }

    const parts = parseScript(text);

    if ("ok" in parts) {
        return parts;
    }

    const steps: SpeechStep[] = [];
    let spokenCharacters = 0;
    let pauseSeconds = 0;

    for (const part of parts) {
        if (part.kind === "pause") {
            steps.push(part);
            pauseSeconds += part.seconds;
            continue;
        }

        for (const piece of chunkSpeechText(removeUnspeakableCharacters(part.text))) {
            steps.push({ kind: "speak", text: piece });
            spokenCharacters += piece.length;
        }
    }

    // Pauses alone are not something to generate: there would be nothing to
    // hear, and a file of silence is never what the press was for.
    if (spokenCharacters === 0) {
        return { ok: false, reason: "empty" };
    }

    return { ok: true, steps, spokenCharacters, pauseSeconds };
}
