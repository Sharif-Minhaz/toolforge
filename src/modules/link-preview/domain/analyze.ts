import type { DecodableImageType } from "@/modules/tools/types";

import type {
    CardImage,
    CardLayout,
    CardText,
    Finding,
    FindingCode,
    FindingSeverity,
    ImageProbe,
    PageFacts,
    PreviewAnalysis,
    PreviewCard,
    PreviewTags,
} from "../types";
import {
    PLATFORM_RULES,
    PREVIEW_PLATFORMS,
    type DescriptionSource,
    type ImageSource,
    type PlatformRules,
    type PreviewPlatform,
    type Provenance,
    type TextLimit,
    type TitleSource,
} from "./platforms";
import { clipGraphemes, clipUtf8Bytes, countGraphemes, countUtf8Bytes, type Clipped } from "./text";
import { displayHost, faviconAddress, isSamePage, resolveTagUrl } from "./urls";

/**
 * Tags plus measurements in, one card per platform and a list of findings out.
 *
 * Pure and deterministic, and the one function both the page and the MCP
 * adapter call: the server fetches and measures, this decides. The page runs it
 * in the island during render, so switching a platform or pasting a head is a
 * re-derivation rather than a round trip — and the paste mode, which never
 * touches the server, runs exactly the same rules as the fetch mode.
 */

export type AnalysisInput = {
    readonly tags: PreviewTags;
    /** What relative addresses resolve against: the final URL, or a pasted page address. */
    readonly pageUrl: URL | null;
    /** What the fetch observed; `null` for pasted markup. */
    readonly page: PageFacts | null;
    /** Pictures the server fetched, matched to cards by absolute address. */
    readonly images: readonly ImageProbe[];
};

/** Card types X documents. Anything else is ignored by X and every platform that reads it. */
export const TWITTER_CARD_TYPES = ["summary", "summary_large_image", "app", "player"] as const;

/** Discord accepts exactly these two spellings and ignores the rest. */
const DISCORD_COLOUR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

/** Keys that mean one thing; a second copy is a template bug, whichever one a platform keeps. */
const SINGULAR_KEYS = [
    "og:title",
    "og:description",
    "og:url",
    "og:type",
    "og:site_name",
    "twitter:card",
    "twitter:title",
    "twitter:description",
    "description",
] as const;

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = { error: 0, warning: 1, info: 2 };

// ---------------------------------------------------------------------------
// Picking the fields
// ---------------------------------------------------------------------------

function titleFrom(tags: PreviewTags, source: TitleSource): string | null {
    return source === "og:title"
        ? tags.og.title
        : source === "twitter:title"
          ? tags.twitter.title
          : tags.document.title;
}

function descriptionFrom(tags: PreviewTags, source: DescriptionSource): string | null {
    return source === "og:description"
        ? tags.og.description
        : source === "twitter:description"
          ? tags.twitter.description
          : tags.document.description;
}

function imageFrom(tags: PreviewTags, source: ImageSource): string | null {
    return source === "og:image" ? (tags.og.images[0]?.url ?? null) : tags.twitter.image;
}

function clip(text: string, limit: TextLimit | null): Clipped {
    if (limit === null) {
        return { text, truncated: false };
    }

    return limit.unit === "bytes"
        ? clipUtf8Bytes(text, limit.value)
        : clipGraphemes(text, limit.value);
}

function pickText<S extends TitleSource | DescriptionSource>(
    chain: readonly S[],
    read: (source: S) => string | null,
    limit: TextLimit | null,
): CardText | null {
    for (const source of chain) {
        const value = read(source);

        if (value !== null) {
            const clipped = clip(value, limit);

            return { text: clipped.text, full: value, clipped: clipped.truncated, source };
        }
    }

    return null;
}

function findProbe(images: readonly ImageProbe[], url: string): ImageProbe | null {
    return images.find((probe) => probe.url === url) ?? null;
}

function pickImage(rules: PlatformRules, input: AnalysisInput): CardImage | null {
    for (const source of rules.imageChain) {
        const raw = imageFrom(input.tags, source);

        if (raw === null) {
            continue;
        }

        // The first tag present is the one a crawler commits to. One that does
        // not resolve is a broken card, not a reason to look further down.
        const resolved = resolveTagUrl(raw, input.pageUrl);

        if (resolved.absolute === null) {
            return null;
        }

        const probe = findProbe(input.images, resolved.absolute);
        const declared = source === "og:image" ? input.tags.og.images[0] : undefined;
        const measured =
            probe !== null && probe.ok && probe.width !== null && probe.height !== null;

        return {
            url: resolved.absolute,
            source,
            probe,
            width: measured ? probe.width : (declared?.width ?? null),
            height: measured ? probe.height : (declared?.height ?? null),
        };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Deciding what the card looks like
// ---------------------------------------------------------------------------

type ImageVerdict =
    | { readonly usable: true }
    | {
          readonly usable: false;
          readonly code: FindingCode;
          readonly provenance: Provenance | null;
          readonly values: Record<string, string | number>;
      };

/** Whether this platform will put this picture on a card at all. */
function judgeImage(rules: PlatformRules, image: CardImage): ImageVerdict {
    const probe = image.probe;

    if (probe !== null && !probe.ok) {
        return { usable: false, code: "image_fetch_failed", provenance: null, values: {} };
    }

    if (probe !== null && probe.ok) {
        const maxBytes = rules.imageMaxBytes;

        if (maxBytes !== null && probe.bytes > maxBytes.value) {
            return {
                usable: false,
                code: "image_too_large",
                provenance: maxBytes.provenance,
                values: { bytes: probe.bytes, limit: maxBytes.value },
            };
        }
    }

    if (image.width === null || image.height === null) {
        return { usable: true };
    }

    const minimum = rules.imageMin;

    if (
        minimum !== null &&
        (image.width < minimum.value.width || image.height < minimum.value.height)
    ) {
        return {
            usable: false,
            code: "image_too_small",
            provenance: minimum.provenance,
            values: {
                width: image.width,
                height: image.height,
                minWidth: minimum.value.width,
                minHeight: minimum.value.height,
            },
        };
    }

    const maxAspect = rules.maxAspect;

    if (maxAspect !== null && image.width / image.height > maxAspect.value) {
        return {
            usable: false,
            code: "image_aspect_extreme",
            provenance: maxAspect.provenance,
            values: { width: image.width, height: image.height, ratio: maxAspect.value },
        };
    }

    return { usable: true };
}

function meetsLargeMinimum(rules: PlatformRules, image: CardImage): boolean {
    const minimum = rules.largeImageMin;

    // Unknown size: assume the large card. Every platform that measures will
    // fetch the picture itself, and a guess of "small" would invent a finding.
    if (minimum === null || image.width === null || image.height === null) {
        return true;
    }

    return image.width >= minimum.value.width && image.height >= minimum.value.height;
}

function decideLayout(
    rules: PlatformRules,
    tags: PreviewTags,
    title: CardText | null,
    image: CardImage | null,
    usable: boolean,
): CardLayout {
    if (title === null && (image === null || !usable)) {
        return "none";
    }

    if (rules.imageChain.length === 0 || image === null || !usable) {
        return "text";
    }

    if (rules.largeCardFromTwitterCard && tags.twitter.card !== "summary_large_image") {
        return "small";
    }

    return meetsLargeMinimum(rules, image) ? "large" : "small";
}

function lastThemeColour(tags: PreviewTags): string | null {
    // Discord documents "last tag wins" for colour, unlike every text field.
    const colours = tags.tags.filter((tag) => tag.kind === "meta" && tag.key === "theme-color");
    const last = colours.at(-1)?.value.trim() ?? null;

    return last !== null && DISCORD_COLOUR.test(last) ? last : null;
}

function cardFor(
    platform: PreviewPlatform,
    input: AnalysisInput,
): { card: PreviewCard; verdict: ImageVerdict | null } {
    const rules = PLATFORM_RULES[platform];
    const { tags, pageUrl } = input;

    const title = pickText(rules.titleChain, (source) => titleFrom(tags, source), rules.titleLimit);
    const description =
        rules.descriptionLines === 0
            ? null
            : pickText(
                  rules.descriptionChain,
                  (source) => descriptionFrom(tags, source),
                  rules.descriptionLimit,
              );
    const image = pickImage(rules, input);
    const verdict = image === null ? null : judgeImage(rules, image);
    const layout = decideLayout(rules, tags, title, image, verdict?.usable ?? false);

    return {
        card: {
            platform,
            layout,
            title,
            description,
            image,
            siteName: tags.og.siteName,
            host: pageUrl === null ? null : displayHost(pageUrl),
            accent: platform === "discord" ? lastThemeColour(tags) : null,
            labels: platform === "slack" ? tags.twitter.labels : [],
            icon: platform === "google" ? faviconAddress(tags, pageUrl) : null,
        },
        verdict,
    };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function finding(
    code: FindingCode,
    severity: FindingSeverity,
    values: Record<string, string | number> = {},
    platform: PreviewPlatform | null = null,
    provenance: Provenance | null = null,
): Finding {
    return { code, severity, platform, provenance, values };
}

function pageFindings(page: PageFacts): Finding[] {
    const findings: Finding[] = [];

    if (page.status < 200 || page.status >= 300) {
        findings.push(finding("page_status", "error", { status: page.status }));
    }

    if (page.contentType !== null && !/html|xml/i.test(page.contentType)) {
        findings.push(finding("not_html", "error", { type: page.contentType }));
    }

    for (const platform of PREVIEW_PLATFORMS) {
        const limit = PLATFORM_RULES[platform].headWithinBytes;

        if (limit === null) {
            continue;
        }

        // No `</head>` before the read ceiling means the head runs past it,
        // and the ceiling is at least as large as every platform's limit.
        const endsAt = page.headEndsAt;

        if (endsAt === null ? page.truncated : endsAt > limit.value) {
            findings.push(
                finding(
                    "head_beyond_limit",
                    platform === "slack" ? "info" : "warning",
                    { limit: limit.value },
                    platform,
                    limit.provenance,
                ),
            );
        }
    }

    return findings;
}

function tagFindings(tags: PreviewTags, pageUrl: URL | null): Finding[] {
    const findings: Finding[] = [];
    const { og, twitter, document } = tags;

    if (og.title === null) findings.push(finding("missing_og_title", "error"));
    if (og.description === null) findings.push(finding("missing_og_description", "warning"));
    if (og.images.length === 0 && twitter.image === null) {
        findings.push(finding("missing_og_image", "error"));
    } else if (og.images.length === 0) {
        // `twitter:image` alone feeds X, Slack, Discord and Telegram, and
        // nothing on Facebook, LinkedIn or WhatsApp.
        findings.push(finding("missing_og_image", "warning"));
    }
    if (og.url === null) {
        findings.push(finding("missing_og_url", "warning", {}, "whatsapp", "official"));
    }
    if (og.type === null) findings.push(finding("missing_og_type", "info"));
    if (og.siteName === null) findings.push(finding("missing_og_site_name", "info"));
    if (document.title === null) findings.push(finding("missing_document_title", "warning"));
    if (document.description === null) findings.push(finding("missing_meta_description", "info"));

    if (twitter.card === null) {
        findings.push(finding("missing_twitter_card", "info", {}, "x"));
    } else if (!(TWITTER_CARD_TYPES as readonly string[]).includes(twitter.card)) {
        findings.push(
            finding("invalid_twitter_card", "warning", { value: twitter.card }, "x", "official"),
        );
    }

    const onName = tags.tags.filter(
        (tag) => tag.kind === "meta" && tag.attribute === "name" && tag.key.startsWith("og:"),
    );

    if (onName.length > 0) {
        findings.push(
            finding("og_on_name_attribute", "info", { key: onName[0].key, count: onName.length }),
        );
    }

    for (const key of SINGULAR_KEYS) {
        const count = tags.tags.filter((tag) => tag.kind === "meta" && tag.key === key).length;

        if (count > 1) {
            findings.push(finding("duplicate_tag", "warning", { key, count }));
        }
    }

    const titles = tags.tags.filter((tag) => tag.kind === "title").length;

    if (titles > 1) {
        findings.push(finding("duplicate_tag", "warning", { key: "title", count: titles }));
    }

    if (og.url !== null && document.canonical !== null) {
        const ogUrl = resolveTagUrl(og.url, pageUrl).absolute;
        const canonical = resolveTagUrl(document.canonical, pageUrl).absolute;

        if (ogUrl !== null && canonical !== null && !isSamePage(ogUrl, canonical)) {
            findings.push(
                finding("og_url_differs_from_canonical", "warning", { ogUrl, canonical }),
            );
        }
    }

    const themeColour = tags.tags
        .filter((tag) => tag.kind === "meta" && tag.key === "theme-color")
        .at(-1);

    if (themeColour !== undefined && !DISCORD_COLOUR.test(themeColour.value.trim())) {
        findings.push(
            finding(
                "invalid_theme_color",
                "info",
                { value: themeColour.value.trim() },
                "discord",
                "official",
            ),
        );
    }

    return findings;
}

/** Address problems, once per distinct picture rather than once per platform. */
function imageAddressFindings(input: AnalysisInput): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    const { tags } = input;

    for (const source of ["og:image", "twitter:image"] as const) {
        const raw = imageFrom(tags, source);

        if (raw === null || seen.has(raw)) {
            continue;
        }

        seen.add(raw);
        const resolved = resolveTagUrl(raw, input.pageUrl);

        if (resolved.absolute === null) {
            findings.push(finding("unresolvable_image", "error", { source, value: raw }));
            continue;
        }

        if (resolved.relative) {
            findings.push(finding("relative_image", "warning", { source, value: raw }));
        }

        if (resolved.insecure) {
            findings.push(finding("insecure_image", "warning", { source }));
        }

        const probe = findProbe(input.images, resolved.absolute);

        if (probe === null) {
            findings.push(finding("image_unmeasured", "info", { source }));
            continue;
        }

        if (!probe.ok) {
            findings.push(finding("image_fetch_failed", "error", { source, reason: probe.reason }));
            continue;
        }

        if (probe.width === null || probe.height === null) {
            findings.push(finding("image_size_unreadable", "info", { source, type: probe.type }));
            continue;
        }

        const declared = source === "og:image" ? tags.og.images[0] : undefined;

        if (declared !== undefined) {
            if (declared.width === null || declared.height === null) {
                findings.push(
                    finding("image_dimensions_undeclared", "info", {}, "facebook", "official"),
                );
            } else if (declared.width !== probe.width || declared.height !== probe.height) {
                findings.push(
                    finding("image_dimensions_mismatch", "warning", {
                        declaredWidth: declared.width,
                        declaredHeight: declared.height,
                        width: probe.width,
                        height: probe.height,
                    }),
                );
            }
        }
    }

    if (seen.size > 0 && tags.og.images[0]?.alt == null && tags.twitter.imageAlt === null) {
        findings.push(finding("missing_image_alt", "info"));
    }

    return findings;
}

function textLength(text: string, limit: TextLimit): number {
    return limit.unit === "bytes" ? countUtf8Bytes(text) : countGraphemes(text);
}

function cardFindings(
    card: PreviewCard,
    verdict: ImageVerdict | null,
    twitterCard: string | null,
): Finding[] {
    const rules = PLATFORM_RULES[card.platform];
    const findings: Finding[] = [];

    // A failed fetch is reported once, by address; repeating it per platform
    // would turn one broken picture into seven errors.
    if (verdict !== null && !verdict.usable && verdict.code !== "image_fetch_failed") {
        findings.push(
            finding(verdict.code, "error", verdict.values, card.platform, verdict.provenance),
        );
    }

    // A format outside the documented list is a warning, not a dropped
    // picture: Facebook documents JPEG, GIF and PNG and renders WebP in
    // practice, so the card keeps the image and the finding says which list
    // the type is missing from.
    const probe = card.image?.probe ?? null;
    const formats = rules.imageFormats;

    if (
        probe !== null &&
        probe.ok &&
        formats !== null &&
        !(formats.value as readonly DecodableImageType[]).includes(probe.type)
    ) {
        findings.push(
            finding(
                "image_format_undocumented",
                "warning",
                { type: probe.type },
                card.platform,
                formats.provenance,
            ),
        );
    }

    // A picture too narrow for the large card. Where the tag picks the card
    // instead, a small card is only this finding when the large one was asked
    // for — otherwise it is `missing_twitter_card`'s business, not the size's.
    const askedForLarge = !rules.largeCardFromTwitterCard || twitterCard === "summary_large_image";

    if (
        card.layout === "small" &&
        card.image !== null &&
        rules.largeImageMin !== null &&
        askedForLarge
    ) {
        findings.push(
            finding(
                "image_thumbnail_only",
                "info",
                { minWidth: rules.largeImageMin.value.width },
                card.platform,
                rules.largeImageMin.provenance,
            ),
        );
    }

    if (card.title !== null && card.title.clipped && rules.titleLimit !== null) {
        findings.push(
            finding(
                "title_too_long",
                "warning",
                {
                    length: textLength(card.title.full, rules.titleLimit),
                    limit: rules.titleLimit.value,
                    unit: rules.titleLimit.unit,
                },
                card.platform,
                rules.titleLimit.provenance,
            ),
        );
    }

    if (card.description !== null && card.description.clipped && rules.descriptionLimit !== null) {
        findings.push(
            finding(
                "description_too_long",
                // WhatsApp's 80 is advice ("will suffice"), not a cut-off.
                card.platform === "whatsapp" ? "info" : "warning",
                {
                    length: textLength(card.description.full, rules.descriptionLimit),
                    limit: rules.descriptionLimit.value,
                    unit: rules.descriptionLimit.unit,
                },
                card.platform,
                rules.descriptionLimit.provenance,
            ),
        );
    }

    return findings;
}

/** The orchestrator. See the comment at the top of the file. */
export function analyzePreview(input: AnalysisInput): PreviewAnalysis {
    const resolved = PREVIEW_PLATFORMS.map((platform) => cardFor(platform, input));

    const findings = [
        ...(input.page === null ? [] : pageFindings(input.page)),
        ...tagFindings(input.tags, input.pageUrl),
        ...imageAddressFindings(input),
        ...resolved.flatMap(({ card, verdict }) =>
            cardFindings(card, verdict, input.tags.twitter.card),
        ),
    ];

    // Stable: within a severity, the order above — page, tags, picture, cards.
    const ordered = findings
        .map((entry, index) => ({ entry, index }))
        .sort(
            (a, b) =>
                SEVERITY_ORDER[a.entry.severity] - SEVERITY_ORDER[b.entry.severity] ||
                a.index - b.index,
        )
        .map(({ entry }) => entry);

    return { cards: resolved.map(({ card }) => card), findings: ordered };
}
