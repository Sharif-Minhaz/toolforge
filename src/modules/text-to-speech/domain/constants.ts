import type { SpeechSettings, SpeechVoiceId } from "../types";

/**
 * Every bound the Text to Speech tool holds, named once.
 *
 * The numbers that look arbitrary were measured against the live service on
 * 2026-10-16 — `docs/case-studies/text-to-speech.md` has the table.
 */

// ─── The text box ───────────────────────────────────────────────────────────

/**
 * The longest text one press may send, in UTF-16 units — what the box's meter
 * counts and what Zod checks, so the two cannot disagree.
 *
 * Ten thousand Bangla characters of non-repeating text came back as fifteen
 * minutes of audio, 5.2 MB, in 122 seconds; single pieces took anywhere from 11
 * to 32 seconds, so the slowest plausible run is about 224 seconds. That is the
 * longest wait this tool will ask of a reader, and it is the number that has to
 * stay under the route's five-minute ceiling — raise this and that has to move
 * with it.
 */
export const MAX_SPEECH_CHARACTERS = 10_000;

/**
 * The most text sent in one request to the service, measured in UTF-8 bytes
 * *after* XML escaping.
 *
 * The service accepted thirteen kilobytes in one request when this was written,
 * so this is not its limit. It is the reference client's — `edge-tts` splits at
 * 4,096 — and matching it keeps this tool on the request shape the service is
 * known to tolerate, which matters more than one fewer round trip.
 */
export const MAX_CHUNK_BYTES = 4_096;

// ─── Pauses ─────────────────────────────────────────────────────────────────

/** What the Pauses menu offers. A reader can type any value in range by hand. */
export const PAUSE_PRESETS = [0.5, 1, 2, 3, 4, 5] as const;

export const MIN_PAUSE_SECONDS = 0.1;

export const MAX_PAUSE_SECONDS = 10;

/**
 * A ceiling on markers, because each one is silence the server writes out
 * frame by frame. Fifty ten-second pauses is three megabytes of silence — bounded,
 * and far past any script a person writes by hand.
 */
export const MAX_PAUSES = 50;

// ─── Voice settings ─────────────────────────────────────────────────────────

export const PROSODY_MIN = -50;

export const PROSODY_MAX = 50;

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = { rate: 0, volume: 0, pitch: 0 };

/** The voice each interface language opens on — the one in the reader's own language. */
export const DEFAULT_VOICE_BY_LOCALE = {
    en: "en-US-JennyNeural",
    bn: "bn-BD-NabanitaNeural",
} as const satisfies Record<string, SpeechVoiceId>;

// ─── Audio ──────────────────────────────────────────────────────────────────

/**
 * The one format this tool asks for: MPEG-2 Layer III, 24 kHz, 48 kbps, mono.
 * Constant bitrate, which is what makes splicing and the duration arithmetic in
 * `mp3.ts` exact rather than estimated.
 */
export const SPEECH_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// ─── The route ──────────────────────────────────────────────────────────────

export const SPEECH_ENDPOINT = "/api/text-to-speech";

/**
 * The largest request body the route reads. Ten thousand characters is at most
 * sixty kilobytes as JSON even if every one is `\uXXXX`-escaped, plus a
 * two-kilobyte Turnstile token and the settings; double that leaves headroom
 * without letting a body grow unbounded.
 */
export const MAX_SPEECH_REQUEST_BYTES = 128 * 1_024;

export const TURNSTILE_ACTION = "text-to-speech";

/** How long the server waits for the service to accept a connection. */
export const SPEECH_CONNECT_TIMEOUT_MS = 15_000;

/** How long the service may go quiet mid-sentence before the attempt is abandoned. */
export const SPEECH_IDLE_TIMEOUT_MS = 45_000;

// ─── Quota ──────────────────────────────────────────────────────────────────

export const SPEECH_WINDOW_MS = 60 * 60 * 1_000;

/** Generations one address may start in an hour. */
export const SPEECH_LIMIT_PER_ADDRESS = 30;

/**
 * Generations the whole deployment may start in an hour.
 *
 * The service sees every reader of this site as one caller — the server's own
 * address — so its patience is shared. This keeps one busy hour from spending
 * it for everybody, and it is the counter that would need raising first if the
 * tool became popular.
 */
export const SPEECH_LIMIT_PER_DEPLOYMENT = 1_200;

// ─── The file tab ───────────────────────────────────────────────────────────

/** The largest document the file tab opens. It is read in the tab, never uploaded. */
export const MAX_SOURCE_FILE_BYTES = 50 * 1_024 * 1_024;

/**
 * The most text the file tab puts in the box. Far past what one generation
 * reads, so the reader still chooses which five thousand characters to send —
 * but bounded, because a fifty-megabyte log in a `<textarea>` stalls the tab.
 */
export const MAX_EXTRACTED_CHARACTERS = 100_000;
