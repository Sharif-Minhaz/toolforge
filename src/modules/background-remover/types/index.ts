/**
 * How much of a picture the cut-out model is asked to look at, and therefore how
 * long the reader waits and how much they download before the first answer.
 *
 * Named for what the reader is choosing rather than for the weights behind it —
 * `isnet_quint8` means nothing to anyone who has not read IMG.LY's manifest —
 * but the mapping is one table in `domain/constants.ts` so the two never drift.
 */
export const CUTOUT_QUALITIES = ["fast", "balanced", "best"] as const;

export type CutoutQuality = (typeof CUTOUT_QUALITIES)[number];

/**
 * What goes behind the cut-out. Four members, three tabs: `transparent` and
 * `color` share the Colour tab, because "no background at all" is the first
 * swatch in that row rather than a mode of its own.
 *
 * Every one of them is only reachable **after** a cut-out exists. There is
 * nothing to put a background behind until then, and a picker that composites
 * nothing is a control that lies about what it does.
 */
export const BACKGROUND_KINDS = ["transparent", "color", "blur", "image"] as const;

export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

/** Which panel is open. `transparent` has no tab of its own — see above. */
export const BACKGROUND_TABS = ["blur", "photo", "color"] as const;

export type BackgroundTab = (typeof BACKGROUND_TABS)[number];

/**
 * Who took a stock photograph and where it came from.
 *
 * Not optional decoration: the Pexels API licence requires the photographer's
 * name and a link back to Pexels wherever one of their pictures is shown, so
 * this travels with the URL rather than beside it and a photo with no credit
 * cannot be constructed.
 */
export type PhotoCredit = {
    readonly photographer: string;
    readonly photographerUrl: string;
    readonly sourceUrl: string;
};

/** One searchable background, as the picker renders it. */
export type StockPhoto = {
    readonly id: string;
    /** Small, for the grid. */
    readonly thumbnailUrl: string;
    /** Large, for the composite. Fetched only when the reader picks this one. */
    readonly fullUrl: string;
    /** Pexels' own one-line description, used as the tile's alt text. */
    readonly description: string;
    readonly credit: PhotoCredit;
};

/**
 * The reader's background choice for one slot.
 *
 * A discriminated union rather than a bag of nullable fields, so "a colour is
 * selected but the kind is blur" is unrepresentable instead of merely unlikely.
 */
export type BackgroundChoice =
    | { readonly kind: "transparent" }
    /** `#rrggbb`, lower-cased. Validated by `parseHexColor` before it gets here. */
    | { readonly kind: "color"; readonly color: string }
    /** 1–100, a share of the picture's shorter side rather than a pixel count. */
    | { readonly kind: "blur"; readonly strength: number }
    | {
          readonly kind: "image";
          readonly url: string;
          /** `null` for a background the reader supplied themselves. */
          readonly credit: PhotoCredit | null;
          /** Shown while the tile is selected; empty for an uploaded file. */
          readonly description: string;
      };

/**
 * What the composite is written as on the way to disk.
 *
 * Three, in the order the picker reads: the one that keeps transparency, the one
 * every other program accepts, and the one that is smaller than both. AVIF is
 * left out because `canvas.toBlob` support for it is still uneven enough that a
 * reader would sometimes press Download and silently receive a PNG.
 */
export const COMPOSITE_FORMATS = ["png", "jpeg", "webp"] as const;

export type CompositeFormat = (typeof COMPOSITE_FORMATS)[number];

/** Everything shown about the picture a slot started from. */
export type SourceImageFacts = {
    readonly name: string;
    readonly type: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
};

/**
 * How a cut-out can fail, in the reader's terms rather than the library's.
 *
 * `model_unavailable` and `removal_failed` are two states, not one: the first
 * says the weights never arrived and retrying on a better connection is the
 * answer, the second says the model ran and threw, which retrying will not fix.
 */
export type CutoutFailureReason =
    | "empty_file"
    | "unsupported_type"
    | "too_large"
    | "undecodable_image"
    | "model_unavailable"
    | "removal_failed"
    | "compose_failed";

/** How the stock-photo search can fail. Each keeps its own name — `CLAUDE.md` rule 28. */
export type PhotoSearchFailureReason =
    | "invalid_request"
    | "not_configured"
    | "rate_limited"
    | "upstream_unavailable"
    | "unreadable_response";

export type PhotoSearchResult =
    | {
          readonly ok: true;
          readonly photos: readonly StockPhoto[];
          /** True when there is another page behind this one. */
          readonly hasMore: boolean;
      }
    | { readonly ok: false; readonly reason: PhotoSearchFailureReason };

/** Which counter refused a search, so the copy can say which allowance ran out. */
export const PHOTO_SEARCH_BUCKETS = ["address", "server"] as const;

export type PhotoSearchBucket = (typeof PHOTO_SEARCH_BUCKETS)[number];
