import type { SPEECH_VOICES, SpeechLocale } from "../domain/voice-catalog";

export type { SpeechLocale };

export type SpeechVoice = (typeof SPEECH_VOICES)[number];

export type SpeechVoiceId = SpeechVoice["id"];

export type SpeechGender = SpeechVoice["gender"];

/** The two tabs: type or paste, or pull the text out of a document. */
export const SPEECH_MODES = ["text", "file"] as const;

export type SpeechMode = (typeof SPEECH_MODES)[number];

/** The three sliders in the settings dialog, in the order they are drawn. */
export const PROSODY_CONTROLS = ["rate", "volume", "pitch"] as const;

export type ProsodyControl = (typeof PROSODY_CONTROLS)[number];

/**
 * Each slider's offset from the voice's own default. Rate and volume are
 * percentages, pitch is hertz — the units the service's `<prosody>` takes.
 */
export type SpeechSettings = Readonly<Record<ProsodyControl, number>>;

/**
 * Why the text in the box cannot be spoken as it stands. A complaint about the
 * input, so it is shown under the box rather than where the audio would be.
 */
export const SCRIPT_FAILURE_REASONS = [
    "empty",
    "too_long",
    "pause_out_of_range",
    "too_many_pauses",
] as const;

export type ScriptFailureReason = (typeof SCRIPT_FAILURE_REASONS)[number];

export type ScriptFailure = {
    readonly ok: false;
    readonly reason: ScriptFailureReason;
    /** 1-based, in characters, for the marker a pause failure is about. */
    readonly position?: number;
};

/** One thing the server does, in order: say a piece of text, or stay quiet. */
export type SpeechStep =
    | { readonly kind: "speak"; readonly text: string }
    | { readonly kind: "pause"; readonly seconds: number };

export type SpeechPlan = {
    readonly ok: true;
    readonly steps: readonly SpeechStep[];
    /** Characters that will actually be read aloud — markers and blank runs excluded. */
    readonly spokenCharacters: number;
    readonly pauseSeconds: number;
};

/**
 * Why a generation did not produce audio. A complaint about the operation, so
 * it is shown where the player would have been.
 *
 * `invalid_request` covers every way the server can find the request itself
 * malformed; the island never sends one, so a reader only sees it if the page
 * and the server disagree about the rules — after a deploy, say.
 */
export const SPEECH_FAILURE_REASONS = [
    "invalid_request",
    "not_configured",
    "challenge_failed",
    "challenge_unavailable",
    "rate_limited",
    "voice_unavailable",
    "upstream_refused",
    "upstream_unavailable",
    "timed_out",
    "interrupted",
] as const;

export type SpeechFailureReason = (typeof SPEECH_FAILURE_REASONS)[number];

/** The body of a refusal the route sends before any audio, as JSON. */
export type SpeechRefusal = {
    readonly ok: false;
    readonly reason: SpeechFailureReason | ScriptFailureReason;
    readonly retryAfterSeconds?: number;
};

/** The formats the file tab reads. Literal, so each one has its own message key. */
export const SOURCE_FORMATS = ["txt", "pdf", "doc", "docx", "odt", "xlsx", "xls", "ods"] as const;

export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export type ExtractionFailureReason =
    "unsupported_format" | "too_large" | "unreadable" | "encrypted" | "empty";

export type ExtractionResult =
    | {
          readonly ok: true;
          readonly text: string;
          readonly format: SourceFormat;
          /** The document held more than `MAX_EXTRACTED_CHARACTERS`; this is the start of it. */
          readonly truncated: boolean;
      }
    | { readonly ok: false; readonly reason: ExtractionFailureReason };
