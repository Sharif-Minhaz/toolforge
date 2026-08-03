/**
 * Two directions over one string. Encoding takes a picture and produces the
 * hash; decoding takes a hash somebody already has and paints it back.
 */
export const BLUR_MODES = ["encode", "decode"] as const;

export type BlurMode = (typeof BLUR_MODES)[number];

/**
 * A BlurHash carries no aspect ratio — the string is a set of DCT coefficients
 * and nothing else — so a hash on its own can be painted at any shape. Encoding
 * knows the source's shape; decoding has to be told.
 */
export const ASPECT_RATIOS = ["16:9", "4:3", "3:2", "1:1", "3:4", "2:3", "9:16"] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Longest edge, in pixels, of the PNG written into the `blurDataURL`. */
export const PLACEHOLDER_EDGES = [16, 24, 32, 48, 64] as const;

export type PlaceholderEdge = (typeof PLACEHOLDER_EDGES)[number];

/**
 * The part of `ImageData` the codec reads, as a plain shape rather than the DOM
 * type — the whole encoder is then testable without a canvas.
 */
export type RgbaImage = {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
};

export type BlurPlaceholderOptions = {
    /** Horizontal detail, 1–9. Each component is two more base83 characters. */
    readonly componentX: number;
    readonly componentY: number;
    /** Contrast multiplier applied while decoding. Never changes the hash. */
    readonly punch: number;
    readonly edge: PlaceholderEdge;
    /** Only read while decoding; encoding takes the shape from the picture. */
    readonly ratio: AspectRatio;
};

/* ------------------------------------------------------------- the codec --- */

export type EncodeBlurhashFailureReason = "invalid_components" | "invalid_image";

export type EncodeBlurhashResult =
    | { readonly ok: true; readonly hash: string }
    | { readonly ok: false; readonly reason: EncodeBlurhashFailureReason };

/**
 * Why a string is not a BlurHash. Kept apart from the encoder's reasons because
 * these are the ones a reader can cause by pasting, and each maps to its own
 * sentence.
 */
export type ParseBlurhashFailureReason =
    "empty_hash" | "invalid_character" | "too_short" | "length_mismatch";

export type ParseBlurhashFailure = {
    readonly ok: false;
    readonly reason: ParseBlurhashFailureReason;
    /** 1-based, set only for `invalid_character`. */
    readonly position?: number;
    /** What the size flag in the first character promised, for the message. */
    readonly expectedLength?: number;
};

export type BlurhashInfo = {
    readonly componentX: number;
    readonly componentY: number;
    readonly length: number;
};

export type ParseBlurhashResult = ({ readonly ok: true } & BlurhashInfo) | ParseBlurhashFailure;

export type DecodeBlurhashResult =
    | {
          readonly ok: true;
          /** Owns its buffer, so it can be handed straight to `ImageData`. */
          readonly pixels: Uint8ClampedArray<ArrayBuffer>;
          readonly width: number;
          readonly height: number;
      }
    | ParseBlurhashFailure
    | { readonly ok: false; readonly reason: "invalid_size" };

/* --------------------------------------------------------- the whole run --- */

/**
 * Everything that can go wrong between a picked file and a placeholder. The
 * first three come from `checkImageFile`, the middle two from this tab's
 * memory, and the last from a codec refusing the picture.
 */
export type PlaceholderFailureReason =
    | "empty_file"
    | "unsupported_type"
    | "too_large"
    | "too_many_pixels"
    | "undecodable"
    | "encode_failed"
    | ParseBlurhashFailureReason;

export type PlaceholderFailure = {
    readonly ok: false;
    readonly reason: PlaceholderFailureReason;
    readonly position?: number;
    readonly expectedLength?: number;
};

export type BlurPlaceholder = {
    readonly hash: string;
    readonly componentX: number;
    readonly componentY: number;
    /** `data:image/png;base64,…`, ready to paste into `blurDataURL`. */
    readonly dataUri: string;
    /** Bytes of the data URI itself — what it costs inlined in your HTML. */
    readonly dataUriBytes: number;
    readonly width: number;
    readonly height: number;
};

export type PlaceholderResult =
    { readonly ok: true; readonly placeholder: BlurPlaceholder } | PlaceholderFailure;

/** A decoded picture held in the workbench, with the shape it arrived in. */
export type PlaceholderSource = {
    readonly name: string;
    /** Downscaled for the transform; the hash of a thumbnail and of the
     *  original agree to more decimal places than the format can hold. */
    readonly pixels: RgbaImage;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
};

export type ReadSourceResult =
    { readonly ok: true; readonly source: PlaceholderSource } | PlaceholderFailure;
