/**
 * The vocabulary of the Link Preview debugger.
 *
 * Every member of every `as const` tuple below is also a message key in both
 * catalogues — `linkPreview.platforms.<id>`, `linkPreview.findings.<code>`,
 * `linkPreview.errors.<reason>` — so renaming one means renaming it in `en.json`
 * and `bn.json` in the same edit.
 */

import type { ImageSource, PreviewPlatform, Provenance, TagSource } from "../domain/platforms";
import type { DecodableImageType } from "@/modules/tools/types";

// ---------------------------------------------------------------------------
// What the page said about itself
// ---------------------------------------------------------------------------

/** Which attribute carried a `<meta>` tag's key. */
export type MetaKeyAttribute = "property" | "name";

/**
 * One tag out of the head, as written, in document order.
 *
 * Kept even after the structured fields below are read out of the list,
 * because the raw table on the page is what a reader compares against their
 * own template — and a duplicate, or a key on the wrong attribute, is only
 * visible in the list.
 */
export type HeadTag = {
    readonly kind: "meta" | "link" | "title";
    /** Lower-cased: `og:title`, `twitter:card`, `description`; for a link, its `rel`. */
    readonly key: string;
    /** Entity-decoded, untrimmed only of what the author wrote inside the quotes. */
    readonly value: string;
    /** Only for `meta`; whether the key came from `property` or `name`. */
    readonly attribute: MetaKeyAttribute | null;
};

/**
 * One `og:image` and the structured properties that followed it.
 *
 * The Open Graph protocol attaches `og:image:width` and friends to the most
 * recent `og:image` before them, so a page that declares two pictures declares
 * two of these, in order. Every platform uses the first.
 */
export type OpenGraphImage = {
    /** As written: possibly relative, possibly `http:`. Resolved later. */
    readonly url: string;
    readonly secureUrl: string | null;
    readonly type: string | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly alt: string | null;
};

export type OpenGraphTags = {
    readonly title: string | null;
    readonly description: string | null;
    readonly url: string | null;
    readonly type: string | null;
    readonly siteName: string | null;
    readonly locale: string | null;
    readonly images: readonly OpenGraphImage[];
};

/** Slack's two extra rows: `twitter:label1` beside `twitter:data1`. */
export type TwitterLabel = {
    readonly label: string;
    readonly data: string;
};

export type TwitterTags = {
    readonly card: string | null;
    readonly title: string | null;
    readonly description: string | null;
    readonly image: string | null;
    readonly imageAlt: string | null;
    readonly site: string | null;
    readonly creator: string | null;
    readonly labels: readonly TwitterLabel[];
};

/** The plain-HTML fallbacks every platform reaches for when Open Graph is absent. */
export type DocumentTags = {
    readonly title: string | null;
    readonly description: string | null;
    readonly canonical: string | null;
    readonly themeColor: string | null;
    /** `rel="icon"` first, then `apple-touch-icon`; as written. */
    readonly icon: string | null;
    /** `<link rel="alternate" type="application/json+oembed">`, as written. */
    readonly oembed: string | null;
    readonly lang: string | null;
};

export type PreviewTags = {
    readonly document: DocumentTags;
    readonly og: OpenGraphTags;
    readonly twitter: TwitterTags;
    readonly tags: readonly HeadTag[];
};

// ---------------------------------------------------------------------------
// What the server measured
// ---------------------------------------------------------------------------

/**
 * Every way a picture can fail to come back. `invalid_url` through
 * `upstream_failed` are the shared remote-image vocabulary; the debugger keeps
 * the names so a reason means the same thing in every tool that fetches one.
 */
export const IMAGE_PROBE_FAILURES = [
    "invalid_url",
    "scheme_not_allowed",
    "blocked_address",
    "too_many_redirects",
    "not_an_image",
    "too_large",
    "empty_response",
    "timed_out",
    "upstream_failed",
] as const;

export type ImageProbeFailure = (typeof IMAGE_PROBE_FAILURES)[number];

export type ImageProbe =
    | {
          readonly ok: true;
          /** The address that was asked for, absolute. */
          readonly url: string;
          readonly type: DecodableImageType;
          readonly bytes: number;
          /** `null` when the header could not be read; never a guess. */
          readonly width: number | null;
          readonly height: number | null;
          /** The picture itself, for the cards; never an address the reader's browser would fetch. */
          readonly dataUrl: string;
      }
    | { readonly ok: false; readonly url: string; readonly reason: ImageProbeFailure };

/** One request on the way to the page. */
export type FetchHop = {
    readonly url: string;
    readonly status: number;
};

/** What the page fetch observed, as opposed to what the page declared. */
export type PageFacts = {
    readonly requestedUrl: string;
    readonly finalUrl: string;
    readonly status: number;
    readonly hops: readonly FetchHop[];
    readonly contentType: string | null;
    readonly charset: string;
    /** Byte offset of `</head>` in the body, or `null` when none arrived. */
    readonly headEndsAt: number | null;
    /** True when the body was cut at the read ceiling. */
    readonly truncated: boolean;
};

// ---------------------------------------------------------------------------
// What the analysis concludes
// ---------------------------------------------------------------------------

/** `none`: no card at all. `text`: a card with no picture. */
export const CARD_LAYOUTS = ["large", "small", "text", "none"] as const;

export type CardLayout = (typeof CARD_LAYOUTS)[number];

export type CardText = {
    /** What the card shows after the platform's own limit, if it has one. */
    readonly text: string;
    readonly full: string;
    readonly clipped: boolean;
    readonly source: TagSource;
};

export type CardImage = {
    /** Absolute address of the picture this platform would pick. */
    readonly url: string;
    readonly source: ImageSource;
    /** The measurement, when this exact address was fetched. */
    readonly probe: ImageProbe | null;
    /** Width and height, measured or else declared; `null` when neither. */
    readonly width: number | null;
    readonly height: number | null;
};

export type PreviewCard = {
    readonly platform: PreviewPlatform;
    readonly layout: CardLayout;
    readonly title: CardText | null;
    readonly description: CardText | null;
    /** The picture the platform would pick, even when the layout cannot show it. */
    readonly image: CardImage | null;
    readonly siteName: string | null;
    /** As a card prints it: lower-case, `www.` dropped. */
    readonly host: string | null;
    /** Discord's accent bar, when the page sets a colour Discord accepts. */
    readonly accent: string | null;
    /** Slack's two extra rows. */
    readonly labels: readonly TwitterLabel[];
    /** Google's favicon, absolute. */
    readonly icon: string | null;
};

export const FINDING_SEVERITIES = ["error", "warning", "info"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CODES = [
    "page_status",
    "not_html",
    "head_beyond_limit",
    "missing_og_title",
    "missing_og_description",
    "missing_og_image",
    "missing_og_url",
    "missing_og_type",
    "missing_og_site_name",
    "missing_document_title",
    "missing_meta_description",
    "missing_twitter_card",
    "invalid_twitter_card",
    "og_on_name_attribute",
    "duplicate_tag",
    "og_url_differs_from_canonical",
    "relative_image",
    "insecure_image",
    "unresolvable_image",
    "image_fetch_failed",
    "image_unmeasured",
    "image_size_unreadable",
    "image_dimensions_undeclared",
    "image_dimensions_mismatch",
    "image_too_small",
    "image_thumbnail_only",
    "image_too_large",
    "image_format_undocumented",
    "image_aspect_extreme",
    "missing_image_alt",
    "title_too_long",
    "description_too_long",
    "invalid_theme_color",
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/**
 * One thing worth fixing, or worth knowing.
 *
 * `values` fill the ICU arguments of `linkPreview.findings.<code>`; every
 * number in it is a plain number, so the island formats it in the reader's
 * locale. `platform` is set when the finding is about one platform's rule, and
 * `provenance` says whether that rule is published or observed.
 */
export type Finding = {
    readonly code: FindingCode;
    readonly severity: FindingSeverity;
    readonly platform: PreviewPlatform | null;
    readonly provenance: Provenance | null;
    readonly values: Readonly<Record<string, string | number>>;
};

export type PreviewAnalysis = {
    readonly cards: readonly PreviewCard[];
    readonly findings: readonly Finding[];
};

// ---------------------------------------------------------------------------
// What crosses the action boundary
// ---------------------------------------------------------------------------

/** Every way the page fetch itself can fail. Each is also a key in `linkPreview.errors`. */
export const PAGE_FETCH_FAILURES = [
    "invalid_url",
    "scheme_not_allowed",
    "blocked_address",
    "unresolved_host",
    "too_many_redirects",
    "timed_out",
    "upstream_failed",
    "empty_response",
] as const;

export type PageFetchFailure = (typeof PAGE_FETCH_FAILURES)[number];

/**
 * Every way a check can be refused. `rate_limited` and `not_configured` are
 * two states, not one: the first will pass in a few minutes, the second never
 * will on this deployment, and the reader is told which.
 */
export const INSPECTION_FAILURES = [
    ...PAGE_FETCH_FAILURES,
    "rate_limited",
    "not_configured",
] as const;

export type InspectionFailure = (typeof INSPECTION_FAILURES)[number];

/** What is left of this visitor's allowance; carried on refusals too. */
export type PreviewAllowance = {
    readonly remaining: number;
    /** Epoch seconds. */
    readonly resetsAt: number;
};

/**
 * The fetched page, reduced to what the analysis needs.
 *
 * The tags rather than the markup: a head is kilobytes and a truncated page a
 * megabyte, and nothing on the page needs the bytes once they are read. The
 * analysis itself is not here either — the island derives it, so the cards
 * and findings come from the same function in both modes.
 */
export type PreviewReport = {
    readonly page: PageFacts;
    readonly tags: PreviewTags;
    readonly images: readonly ImageProbe[];
    readonly fetchedAt: string;
};

export type InspectionResult =
    | ({ readonly ok: true; readonly allowance: PreviewAllowance } & PreviewReport)
    | {
          readonly ok: false;
          readonly reason: InspectionFailure;
          readonly allowance?: PreviewAllowance;
      };

/** The paste mode's one server call: measuring a picture it found in the markup. */
export type ImageProbeResult =
    | { readonly ok: true; readonly probe: ImageProbe; readonly allowance: PreviewAllowance }
    | {
          readonly ok: false;
          readonly reason:
              | "invalid_url"
              | "scheme_not_allowed"
              | "rate_limited"
              | "not_configured"
              | "upstream_failed";
          readonly allowance?: PreviewAllowance;
      };
