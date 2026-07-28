import { MAX_DETECTION_TEXT_LENGTH, MIN_DETECTION_TEXT_LENGTH } from "./constants";

export type DetectionTextCheck =
    | { readonly ok: true; readonly text: string; readonly length: number }
    | {
          readonly ok: false;
          readonly reason: "empty" | "too_short" | "too_long";
          readonly length: number;
      };

/**
 * Gate a passage against the detector's length window before a request is
 * worth making. Measured on the trimmed string in UTF-16 units, which is what
 * the worker itself counts — disagreeing here would send requests it rejects.
 */
export function checkDetectionText(raw: string): DetectionTextCheck {
    const text = raw.trim();

    if (text.length === 0) {
        return { ok: false, reason: "empty", length: 0 };
    }

    if (text.length < MIN_DETECTION_TEXT_LENGTH) {
        return { ok: false, reason: "too_short", length: text.length };
    }

    if (text.length > MAX_DETECTION_TEXT_LENGTH) {
        return { ok: false, reason: "too_long", length: text.length };
    }

    return { ok: true, text, length: text.length };
}

/** Characters still needed before the passage can be analysed; 0 once ready. */
export function charactersRemaining(raw: string): number {
    return Math.max(0, MIN_DETECTION_TEXT_LENGTH - raw.trim().length);
}
