import type { DecodableImageType } from "@/modules/tools/types";

/**
 * How each platform turns a page's tags into a card.
 *
 * **Data, with a source on every number.** The platforms publish part of
 * their rules and keep the rest to themselves, so each figure says which it is:
 * `official` is the platform's own documentation; `reported` is a community
 * measurement or a reputable write-up, and the card on the page marks it as
 * such. A threshold with neither is not here at all — inventing one would turn
 * a debugger into a source of folklore.
 *
 * Re-check these when a platform changes its cards. The URLs below are the
 * pages to read; `docs/case-studies/link-preview.md` records when they were
 * last read and what was contested.
 */

export const PREVIEW_PLATFORMS = [
    "facebook",
    "x",
    "linkedin",
    "whatsapp",
    "slack",
    "discord",
    "telegram",
    "google",
] as const;

export type PreviewPlatform = (typeof PREVIEW_PLATFORMS)[number];

export type Provenance = "official" | "reported";

export type Sourced<T> = {
    readonly value: T;
    readonly provenance: Provenance;
    readonly source: string;
};

/** Where a card's text or picture came from — shown on the card, so a fallback is visible. */
export const TAG_SOURCES = [
    "og:title",
    "twitter:title",
    "title",
    "og:description",
    "twitter:description",
    "description",
    "og:image",
    "twitter:image",
] as const;

export type TagSource = (typeof TAG_SOURCES)[number];

export type TitleSource = Extract<TagSource, "og:title" | "twitter:title" | "title">;

export type DescriptionSource = Extract<
    TagSource,
    "og:description" | "twitter:description" | "description"
>;

export type ImageSource = Extract<TagSource, "og:image" | "twitter:image">;

/** How a limit is counted. Discord counts UTF-8 bytes, which a Bangla title spends three at a time. */
export type LimitUnit = "graphemes" | "bytes";

export type TextLimit = Sourced<number> & { readonly unit: LimitUnit };

export type PlatformRules = {
    readonly id: PreviewPlatform;
    readonly titleChain: readonly TitleSource[];
    readonly descriptionChain: readonly DescriptionSource[];
    /** Empty for a card that never shows a picture. */
    readonly imageChain: readonly ImageSource[];
    /** Lines the card gives each field before it clamps; drives the CSS, not the findings. */
    readonly titleLines: number;
    readonly descriptionLines: number;
    /** `null` when the platform shows no description on any card. */
    readonly titleLimit: TextLimit | null;
    readonly descriptionLimit: TextLimit | null;
    /** Below this, no picture at all. */
    readonly imageMin: Sourced<{ readonly width: number; readonly height: number }> | null;
    /** At or above this, the large card; below it, the thumbnail. `null` when the tag decides. */
    readonly largeImageMin: Sourced<{ readonly width: number; readonly height: number }> | null;
    readonly imageMaxBytes: Sourced<number> | null;
    /** Width over height of the large card's crop. */
    readonly largeRatio: number;
    /** `null` when the platform has not said. */
    readonly imageFormats: Sourced<readonly DecodableImageType[]> | null;
    /** Widest ratio of width to height it will show at all. */
    readonly maxAspect: Sourced<number> | null;
    /** True when `twitter:card=summary_large_image` is what selects the large card. */
    readonly largeCardFromTwitterCard: boolean;
    /** The platform's own inspector, for the reader to confirm against. */
    readonly debugger: string | null;
    /** How much of the HTML it reads before giving up on the head, in bytes. */
    readonly headWithinBytes: Sourced<number> | null;
    /** The page these rules were read from, linked under the card. */
    readonly reference: string;
    /**
     * Whether the card's *shape* — which fields it shows, where the picture
     * sits — is documented, or reconstructed from what people observe. X's
     * current large card, for one, is described nowhere official.
     */
    readonly layoutProvenance: Provenance;
};

const FACEBOOK_DOCS = "https://developers.facebook.com/docs/sharing/webmasters";
const FACEBOOK_IMAGES = "https://developers.facebook.com/docs/sharing/webmasters/images";
const FACEBOOK_CRAWLER = "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers";
const X_MARKUP = "https://developer.x.com/en/docs/x-for-websites/cards/overview/markup";
const X_LARGE =
    "https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image";
const X_REPORTED = "https://kb.theseoframework.com/kb/twitter-cards-and-x-sharing/";
const LINKEDIN_HELP = "https://www.linkedin.com/help/linkedin/answer/46687";
const WHATSAPP_DOCS =
    "https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/";
const SLACK_ROBOTS = "https://api.slack.com/robots";
const SLACK_REPORTED =
    "https://medium.com/slack-developer-blog/everything-you-ever-wanted-to-know-about-unfurling-but-were-afraid-to-ask-or-how-to-make-your-e64b4bb9254";
const DISCORD_DOCS = "https://docs.discord.com/developers/link-previews/overview";
const TELEGRAM_REPORTED = "https://core.telegram.org/bots/api#linkpreviewoptions";
const GOOGLE_TITLE = "https://developers.google.com/search/docs/appearance/title-link";
const GOOGLE_REPORTED = "https://zyppy.com/title-tags/meta-title-tag-length/";

const MB = 1024 * 1024;
const KB = 1024;

const official = <T>(value: T, source: string): Sourced<T> => ({
    value,
    provenance: "official",
    source,
});

const reported = <T>(value: T, source: string): Sourced<T> => ({
    value,
    provenance: "reported",
    source,
});

export const PLATFORM_RULES: Readonly<Record<PreviewPlatform, PlatformRules>> = {
    facebook: {
        id: "facebook",
        // Facebook says only that it uses "internal heuristics" without Open
        // Graph; the document title is what those heuristics land on in
        // practice, and the card marks it as a fallback.
        titleChain: ["og:title", "title"],
        descriptionChain: ["og:description", "description"],
        imageChain: ["og:image"],
        titleLines: 2,
        descriptionLines: 1,
        titleLimit: null,
        descriptionLimit: null,
        imageMin: official({ width: 200, height: 200 }, FACEBOOK_IMAGES),
        largeImageMin: official({ width: 600, height: 315 }, FACEBOOK_IMAGES),
        imageMaxBytes: official(8 * MB, FACEBOOK_IMAGES),
        largeRatio: 1.91,
        imageFormats: official(["image/jpeg", "image/gif", "image/png"], FACEBOOK_DOCS),
        maxAspect: null,
        largeCardFromTwitterCard: false,
        debugger: "https://developers.facebook.com/tools/debug/",
        headWithinBytes: official(1 * MB, FACEBOOK_CRAWLER),
        reference: FACEBOOK_DOCS,
        layoutProvenance: "official",
    },
    x: {
        id: "x",
        titleChain: ["twitter:title", "og:title"],
        descriptionChain: ["twitter:description", "og:description"],
        imageChain: ["twitter:image", "og:image"],
        titleLines: 1,
        descriptionLines: 2,
        titleLimit: { ...official(70, X_MARKUP), unit: "graphemes" },
        descriptionLimit: { ...official(200, X_MARKUP), unit: "graphemes" },
        imageMin: reported({ width: 144, height: 144 }, X_REPORTED),
        largeImageMin: official({ width: 300, height: 157 }, X_LARGE),
        imageMaxBytes: official(5 * MB, X_MARKUP),
        largeRatio: 2,
        imageFormats: official(["image/jpeg", "image/png", "image/webp", "image/gif"], X_MARKUP),
        maxAspect: null,
        largeCardFromTwitterCard: true,
        // The Card Validator was retired in 2022 and nothing replaced it.
        debugger: null,
        headWithinBytes: null,
        reference: X_REPORTED,
        layoutProvenance: "reported",
    },
    linkedin: {
        id: "linkedin",
        // LinkedIn ignores `twitter:*`; its fallbacks are unpublished beyond
        // "backup ways", which in practice is the document title.
        titleChain: ["og:title", "title"],
        descriptionChain: ["og:description", "description"],
        imageChain: ["og:image"],
        titleLines: 2,
        descriptionLines: 0,
        titleLimit: null,
        descriptionLimit: null,
        imageMin: null,
        largeImageMin: official({ width: 401, height: 1 }, LINKEDIN_HELP),
        imageMaxBytes: official(5 * MB, LINKEDIN_HELP),
        largeRatio: 1.91,
        imageFormats: official(["image/jpeg", "image/png", "image/gif"], LINKEDIN_HELP),
        maxAspect: null,
        largeCardFromTwitterCard: false,
        debugger: "https://www.linkedin.com/post-inspector/",
        headWithinBytes: null,
        reference: LINKEDIN_HELP,
        layoutProvenance: "official",
    },
    whatsapp: {
        id: "whatsapp",
        titleChain: ["og:title", "title"],
        descriptionChain: ["og:description", "description"],
        imageChain: ["og:image"],
        titleLines: 2,
        descriptionLines: 2,
        titleLimit: null,
        descriptionLimit: { ...official(80, WHATSAPP_DOCS), unit: "graphemes" },
        imageMin: null,
        largeImageMin: official({ width: 300, height: 1 }, WHATSAPP_DOCS),
        // The 300 KB figure that circulates is the *head* limit below,
        // misremembered; WhatsApp's own page says 600 KB for the picture.
        imageMaxBytes: official(600 * KB, WHATSAPP_DOCS),
        largeRatio: 1.91,
        imageFormats: null,
        maxAspect: official(4, WHATSAPP_DOCS),
        largeCardFromTwitterCard: false,
        // WhatsApp has none; its advice is to compose the message and wait.
        debugger: null,
        headWithinBytes: official(300 * KB, WHATSAPP_DOCS),
        reference: WHATSAPP_DOCS,
        layoutProvenance: "official",
    },
    slack: {
        id: "slack",
        titleChain: ["og:title", "twitter:title", "title"],
        descriptionChain: ["og:description", "twitter:description", "description"],
        imageChain: ["og:image", "twitter:image"],
        titleLines: 1,
        descriptionLines: 3,
        titleLimit: null,
        descriptionLimit: null,
        imageMin: null,
        largeImageMin: null,
        imageMaxBytes: null,
        largeRatio: 1.91,
        imageFormats: null,
        maxAspect: null,
        largeCardFromTwitterCard: true,
        debugger: null,
        headWithinBytes: reported(32 * KB, SLACK_REPORTED),
        reference: SLACK_ROBOTS,
        layoutProvenance: "reported",
    },
    discord: {
        id: "discord",
        titleChain: ["og:title", "twitter:title", "title"],
        descriptionChain: ["og:description", "twitter:description", "description"],
        imageChain: ["og:image", "twitter:image"],
        titleLines: 3,
        descriptionLines: 20,
        titleLimit: { ...official(70, DISCORD_DOCS), unit: "bytes" },
        descriptionLimit: { ...official(350, DISCORD_DOCS), unit: "bytes" },
        imageMin: null,
        largeImageMin: null,
        imageMaxBytes: null,
        largeRatio: 1.91,
        imageFormats: official(
            ["image/png", "image/gif", "image/jpeg", "image/webp", "image/avif"],
            DISCORD_DOCS,
        ),
        maxAspect: null,
        largeCardFromTwitterCard: true,
        debugger: "https://discord.com/developers/embeds",
        headWithinBytes: null,
        reference: DISCORD_DOCS,
        layoutProvenance: "official",
    },
    telegram: {
        id: "telegram",
        titleChain: ["og:title", "twitter:title", "title"],
        descriptionChain: ["og:description", "twitter:description", "description"],
        imageChain: ["og:image", "twitter:image"],
        titleLines: 2,
        descriptionLines: 3,
        titleLimit: null,
        descriptionLimit: null,
        imageMin: null,
        largeImageMin: null,
        imageMaxBytes: null,
        largeRatio: 1.91,
        imageFormats: null,
        maxAspect: null,
        largeCardFromTwitterCard: true,
        debugger: null,
        headWithinBytes: null,
        reference: TELEGRAM_REPORTED,
        layoutProvenance: "reported",
    },
    google: {
        id: "google",
        // Google writes its own title link from several sources; `<title>`
        // is the one a page controls most directly.
        titleChain: ["title", "og:title"],
        descriptionChain: ["description", "og:description"],
        imageChain: [],
        titleLines: 1,
        descriptionLines: 2,
        // Pixel-based in reality (about 580 px and 920 px); these are the
        // character counts those widths usually hold.
        titleLimit: { ...reported(60, GOOGLE_REPORTED), unit: "graphemes" },
        descriptionLimit: { ...reported(160, GOOGLE_REPORTED), unit: "graphemes" },
        imageMin: null,
        largeImageMin: null,
        imageMaxBytes: null,
        largeRatio: 1,
        imageFormats: null,
        maxAspect: null,
        largeCardFromTwitterCard: false,
        debugger: "https://search.google.com/test/rich-results",
        headWithinBytes: null,
        reference: GOOGLE_TITLE,
        layoutProvenance: "official",
    },
};
