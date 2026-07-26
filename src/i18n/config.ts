export const LOCALES = ["en", "bn"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that persists the visitor's language choice across requests. */
export const LOCALE_COOKIE = "toolforge.locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type LocaleDescriptor = {
    /** Endonym — always rendered in its own language, never translated. */
    readonly nativeName: string;
    /** Short badge shown in the collapsed switcher. */
    readonly shortName: string;
};

export const LOCALE_DESCRIPTORS: Record<Locale, LocaleDescriptor> = {
    en: { nativeName: "English", shortName: "EN" },
    bn: { nativeName: "বাংলা", shortName: "বাং" },
};

export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && LOCALES.includes(value as Locale);
}
