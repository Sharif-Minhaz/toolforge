import type { Locale } from "@/i18n/config";

/**
 * Absolute origin used for canonical URLs, Open Graph tags, and JSON-LD.
 * Falls back to localhost so builds work without deployment config.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_NAME = "ToolForge";

export const SITE_AUTHOR = "Sharif Minhaz";

export const SITE_REPOSITORY = "https://github.com/Sharif-Minhaz/toolforge";

/**
 * The shared social card. 1200×630 is the 1.91:1 ratio every platform crops
 * to, and PNG rather than WebP because LinkedIn still refuses WebP previews.
 */
export const OG_IMAGE = {
    url: "/og.png",
    width: 1200,
    height: 630,
    type: "image/png",
} as const;

/** Open Graph wants a language_TERRITORY tag, not the bare locale code. */
export const OG_LOCALES: Record<Locale, string> = {
    en: "en_US",
    bn: "bn_BD",
};

/** Terms that describe the site as a whole, prepended to every page's keywords. */
export const SITE_KEYWORDS: readonly string[] = [
    "developer tools",
    "online tools",
    "web tools",
    "privacy first",
    "client side",
    "no upload",
    "free developer utilities",
];

export function absoluteUrl(path: string): string {
    return new URL(path, SITE_URL).toString();
}
