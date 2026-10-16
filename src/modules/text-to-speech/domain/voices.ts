import type { SpeechLocale, SpeechVoice, SpeechVoiceId } from "../types";
import { DEFAULT_VOICE_BY_LOCALE } from "./constants";
import { SPEECH_LOCALE_NAMES, SPEECH_VOICES } from "./voice-catalog";

/**
 * Lookups over the frozen catalogue. The list itself is data and lives in
 * `voice-catalog.ts`; everything that interprets it is here.
 */

const VOICES_BY_ID: ReadonlyMap<string, SpeechVoice> = new Map(
    SPEECH_VOICES.map((voice) => [voice.id, voice]),
);

export function isSpeechVoiceId(value: string): value is SpeechVoiceId {
    return VOICES_BY_ID.has(value);
}

export function getSpeechVoice(id: SpeechVoiceId): SpeechVoice {
    // Total by construction: the id type is the catalogue's own union.
    return VOICES_BY_ID.get(id) as SpeechVoice;
}

export function isSpeechLocale(value: string): value is SpeechLocale {
    return Object.hasOwn(SPEECH_LOCALE_NAMES, value);
}

/** Every locale with at least one voice, in catalogue order. */
export const SPEECH_LOCALES = Object.keys(SPEECH_LOCALE_NAMES) as SpeechLocale[];

export function voicesForLocale(locale: SpeechLocale): readonly SpeechVoice[] {
    return SPEECH_VOICES.filter((voice) => voice.locale === locale);
}

/**
 * The language a locale belongs to — `bn` for both `bn-BD` and `bn-IN`. The
 * locale menu groups by this, the way the reader thinks of it: "Bangla", then
 * which Bangla.
 */
export function languageOfLocale(locale: SpeechLocale): string {
    return locale.split("-")[0] ?? locale;
}

/**
 * The voice the page opens on, from the interface language. An interface
 * language without a voice of its own falls back to English, because a reader
 * who chose it can at least read the default.
 */
export function defaultVoiceFor(interfaceLocale: string): SpeechVoiceId {
    return interfaceLocale in DEFAULT_VOICE_BY_LOCALE
        ? DEFAULT_VOICE_BY_LOCALE[interfaceLocale as keyof typeof DEFAULT_VOICE_BY_LOCALE]
        : DEFAULT_VOICE_BY_LOCALE.en;
}

/**
 * The voice to land on after the locale changes: the same gender as before if
 * the new locale has one, otherwise its first voice. Keeping the gender is what
 * a reader comparing accents expects — switching from Jenny to an Australian
 * voice should not also switch to a man.
 */
export function voiceAfterLocaleChange(
    current: SpeechVoiceId,
    nextLocale: SpeechLocale,
): SpeechVoiceId {
    const candidates = voicesForLocale(nextLocale);
    const gender = getSpeechVoice(current).gender;
    const sameGender = candidates.find((voice) => voice.gender === gender);

    // Every locale in the catalogue has at least one voice, so the second
    // fallback is never reached; it keeps the function total all the same.
    return (sameGender ?? candidates[0])?.id ?? current;
}
