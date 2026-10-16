import "server-only";

import type { SpeechLocale } from "../types";
import { SPEECH_LOCALE_NAMES } from "../domain/voice-catalog";
import { languageOfLocale, SPEECH_LOCALES } from "../domain/voices";

/**
 * The locale picker's groups, labelled in the reader's interface language and
 * sorted, on the server.
 *
 * On the server because the labels come from `Intl.DisplayNames`, and the ICU
 * data behind it is whatever the host shipped — Node's and a browser's
 * disagree about Bangla names for less common languages. Rendered once and
 * passed down, the server pass and the hydration pass read the same strings.
 */

export type VoiceLocaleOption = {
    readonly locale: SpeechLocale;
    readonly label: string;
};

export type VoiceLanguageGroup = {
    readonly language: string;
    readonly label: string;
    readonly locales: readonly VoiceLocaleOption[];
};

function displayNames(interfaceLocale: string): Intl.DisplayNames | null {
    try {
        return new Intl.DisplayNames([interfaceLocale], { type: "language", fallback: "none" });
    } catch {
        return null;
    }
}

/**
 * Microsoft's own English names are kept for English: they are more specific
 * than ICU's ("Chinese (Northeastern Mandarin, Simplified)") and they are what
 * the voices are documented under. Other interface languages get ICU's name
 * for an ordinary language–region pair, and Microsoft's for the handful of
 * tags with a script or dialect subtag, which ICU renders as raw codes.
 */
function localeLabel(
    locale: SpeechLocale,
    interfaceLocale: string,
    names: Intl.DisplayNames | null,
): string {
    const english = SPEECH_LOCALE_NAMES[locale];

    if (interfaceLocale === "en" || names === null || locale.split("-").length !== 2) {
        return english;
    }

    try {
        return names.of(locale) ?? english;
    } catch {
        return english;
    }
}

function languageLabel(
    language: string,
    sample: SpeechLocale,
    interfaceLocale: string,
    names: Intl.DisplayNames | null,
): string {
    // The part of Microsoft's name before the region, as a fallback.
    const english = SPEECH_LOCALE_NAMES[sample].split(" (")[0] ?? language;

    if (interfaceLocale === "en" || names === null) {
        return english;
    }

    try {
        return names.of(language) ?? english;
    } catch {
        return english;
    }
}

/**
 * Grouped by language, the reader's own interface language first and English
 * second — the two most likely answers — then everything else alphabetically
 * in the reader's collation.
 */
export function buildVoiceLanguageGroups(interfaceLocale: string): VoiceLanguageGroup[] {
    const names = displayNames(interfaceLocale);
    const collator = new Intl.Collator(interfaceLocale);
    const byLanguage = new Map<string, SpeechLocale[]>();

    for (const locale of SPEECH_LOCALES) {
        const language = languageOfLocale(locale);

        byLanguage.set(language, [...(byLanguage.get(language) ?? []), locale]);
    }

    const groups: VoiceLanguageGroup[] = [...byLanguage].map(([language, locales]) => ({
        language,
        label: languageLabel(language, locales[0], interfaceLocale, names),
        locales: locales
            .map((locale) => ({ locale, label: localeLabel(locale, interfaceLocale, names) }))
            .toSorted((a, b) => collator.compare(a.label, b.label)),
    }));

    const pinned = [interfaceLocale, "en"];
    const rank = (language: string) => {
        const index = pinned.indexOf(language);

        return index < 0 ? pinned.length : index;
    };

    return groups.toSorted(
        (a, b) => rank(a.language) - rank(b.language) || collator.compare(a.label, b.label),
    );
}
