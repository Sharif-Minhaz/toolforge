import type { Locale } from "@/i18n/config";

const PRODUCTION_SITE_URL = "https://toolforge.minhaz.bond";

type SiteUrlEnvironment = {
    readonly vercelEnv?: string;
    readonly nodeEnv?: string;
    readonly configuredUrl?: string;
    readonly vercelUrl?: string;
};

/** Production metadata must never inherit a preview hostname from deployment config. */
export function resolveSiteUrl({
    vercelEnv,
    nodeEnv,
    configuredUrl,
    vercelUrl,
}: SiteUrlEnvironment): string {
    if (vercelEnv === "production" || (vercelEnv === undefined && nodeEnv === "production")) {
        return PRODUCTION_SITE_URL;
    }

    if (configuredUrl?.trim()) {
        return configuredUrl.trim();
    }

    if (vercelEnv === "preview" && vercelUrl) {
        return `https://${vercelUrl}`;
    }

    return "http://localhost:3000";
}

/** Absolute origin used for canonical URLs, Open Graph tags, and JSON-LD. */
export const SITE_URL = resolveSiteUrl({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    configuredUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
});

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
