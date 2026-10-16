import { describe, expect, test } from "bun:test";

import { DEFAULT_VOICE_BY_LOCALE } from "@/modules/text-to-speech/domain/constants";
import {
    clearStoredSettings,
    readStoredSettings,
    SETTINGS_STORAGE_KEY,
    writeStoredSettings,
    type SettingsStorage,
} from "@/modules/text-to-speech/domain/settings-storage";
import { SPEECH_LOCALE_NAMES, SPEECH_VOICES } from "@/modules/text-to-speech/domain/voice-catalog";
import {
    defaultVoiceFor,
    isSpeechVoiceId,
    languageOfLocale,
    SPEECH_LOCALES,
    voiceAfterLocaleChange,
    voicesForLocale,
} from "@/modules/text-to-speech/domain/voices";

describe("the frozen catalogue", () => {
    test("ids are unique and each names its own locale", () => {
        const ids = SPEECH_VOICES.map((voice) => voice.id);

        expect(new Set(ids).size).toBe(ids.length);

        for (const voice of SPEECH_VOICES) {
            expect(voice.id.startsWith(`${voice.locale}-`)).toBe(true);
            expect(voice.id.endsWith("Neural")).toBe(true);
        }
    });

    test("every voice's locale has a name, and every named locale has a voice", () => {
        const used = new Set<string>(SPEECH_VOICES.map((voice) => voice.locale));

        expect(new Set(Object.keys(SPEECH_LOCALE_NAMES))).toEqual(used);
    });

    test("both interface languages open on a voice that exists", () => {
        for (const id of Object.values(DEFAULT_VOICE_BY_LOCALE)) {
            expect(isSpeechVoiceId(id)).toBe(true);
        }

        expect(defaultVoiceFor("bn")).toBe("bn-BD-NabanitaNeural");
        expect(defaultVoiceFor("fr")).toBe("en-US-JennyNeural");
    });

    test("an id from outside the catalogue is refused", () => {
        expect(isSpeechVoiceId("en-US-NobodyNeural")).toBe(false);
        expect(isSpeechVoiceId("toString")).toBe(false);
    });
});

describe("switching locale", () => {
    test("keeps the gender when the new locale has one", () => {
        expect(voiceAfterLocaleChange("en-US-GuyNeural", "bn-BD")).toBe("bn-BD-PradeepNeural");
        expect(voiceAfterLocaleChange("en-US-JennyNeural", "bn-BD")).toBe("bn-BD-NabanitaNeural");
    });

    test("falls back to the locale's first voice otherwise", () => {
        const single = SPEECH_LOCALES.find(
            (locale) => new Set(voicesForLocale(locale).map((voice) => voice.gender)).size === 1,
        );

        expect(single).toBeDefined();

        if (single === undefined) {
            return;
        }

        const [only] = voicesForLocale(single);
        const other = only.gender === "female" ? "en-US-GuyNeural" : "en-US-JennyNeural";

        expect(voiceAfterLocaleChange(other, single)).toBe(only.id);
    });

    test("groups locales by language", () => {
        expect(languageOfLocale("bn-IN")).toBe("bn");
        expect(languageOfLocale("iu-Cans-CA")).toBe("iu");
    });
});

describe("remembered settings", () => {
    function memory(initial?: string): SettingsStorage & { value: string | null } {
        return {
            value: initial ?? null,
            getItem() {
                return this.value;
            },
            setItem(_key, value) {
                this.value = value;
            },
            removeItem() {
                this.value = null;
            },
        };
    }

    test("nothing kept reads as off", () => {
        expect(readStoredSettings(memory())).toBeNull();
        expect(readStoredSettings(undefined)).toBeNull();
    });

    test("round-trips", () => {
        const storage = memory();

        writeStoredSettings({ rate: 10, volume: -5, pitch: 0 }, storage);
        expect(readStoredSettings(storage)).toEqual({ rate: 10, volume: -5, pitch: 0 });

        clearStoredSettings(storage);
        expect(readStoredSettings(storage)).toBeNull();
    });

    test("a hand-edited value degrades field by field", () => {
        expect(readStoredSettings(memory('{"rate":999,"volume":"loud"}'))).toEqual({
            rate: 50,
            volume: 0,
            pitch: 0,
        });
        expect(readStoredSettings(memory("not json"))).toBeNull();
        expect(readStoredSettings(memory("[1,2,3]"))).toBeNull();
    });

    test("a storage that throws is the same as none", () => {
        const hostile: SettingsStorage = {
            getItem() {
                throw new Error("blocked");
            },
            setItem() {
                throw new Error("full");
            },
            removeItem() {
                throw new Error("blocked");
            },
        };

        expect(readStoredSettings(hostile)).toBeNull();
        expect(() => writeStoredSettings({ rate: 0, volume: 0, pitch: 0 }, hostile)).not.toThrow();
        expect(() => clearStoredSettings(hostile)).not.toThrow();
    });

    test("uses its own key", () => {
        expect(SETTINGS_STORAGE_KEY).toBe("toolforge:text-to-speech:settings");
    });
});
