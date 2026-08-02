/**
 * What the reader picks in the format control.
 *
 * `auto` keeps whatever the file already was, `smallest` encodes to every
 * candidate and keeps the shortest result; the remaining four name one encoder
 * outright. Declared as a literal union so `formats.<value>` message keys stay
 * statically checkable.
 */
export const OUTPUT_FORMATS = ["auto", "smallest", "webp", "avif", "jpeg", "png"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** A format something can actually be written as, once `auto` has been resolved. */
export const ENCODED_FORMATS = ["webp", "avif", "jpeg", "png"] as const;

export type EncodedFormat = (typeof ENCODED_FORMATS)[number];

/**
 * The types the tool accepts. Wider than what it writes: a GIF or a BMP is
 * decodable by every browser and worth re-encoding, but nothing here emits
 * either, so both resolve to PNG under `auto`.
 */
export const SOURCE_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
    "image/bmp",
] as const;

export type SourceImageType = (typeof SOURCE_IMAGE_TYPES)[number];

export type CompressionOptions = {
    /** 10–100. Ignored by PNG, which this tool only ever writes losslessly. */
    readonly quality: number;
    readonly format: OutputFormat;
    /** Longest-edge cap in pixels, or `null` to keep the original dimensions. */
    readonly maxEdge: number | null;
};

/**
 * Everything that can go wrong between picking a file and holding a smaller
 * one. `unsupported_type`, `empty_file` and `too_large` are raised by the shared
 * `checkImageFile` gate; the rest belong to this tool.
 */
export type CompressionFailureReason =
    | "empty_file"
    | "unsupported_type"
    | "too_large"
    | "too_many_files"
    | "too_many_pixels"
    | "undecodable"
    | "encode_failed";

export type PixelSize = {
    readonly width: number;
    readonly height: number;
};

/** What is known about a picked file before anything is encoded. */
export type SourceFacts = PixelSize & {
    readonly name: string;
    readonly type: string;
    readonly bytes: number;
};

export type CompressedImage = PixelSize & {
    readonly format: EncodedFormat;
    readonly bytes: number;
    readonly blob: Blob;
    /** True when a transparent source was flattened onto white to fit JPEG. */
    readonly flattened: boolean;
    /** True when the size cap actually scaled this picture down. */
    readonly resized: boolean;
};

export type CompressionOutcome =
    | { readonly ok: true; readonly image: CompressedImage }
    | { readonly ok: false; readonly reason: CompressionFailureReason };

/** Batch totals, in bytes and as a percentage of the originals. */
export type SavingsSummary = {
    readonly count: number;
    readonly originalBytes: number;
    readonly outputBytes: number;
    /** Negative when the batch grew, which a lossless re-encode can do. */
    readonly savedBytes: number;
    readonly percent: number;
};

/** One member of the ZIP the "download all" button builds. */
export type ArchiveEntry = {
    readonly name: string;
    readonly bytes: Uint8Array;
};
