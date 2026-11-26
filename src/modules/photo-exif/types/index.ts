/** Containers the tool recognises by their first bytes. */
export const PHOTO_FORMATS = ["jpeg", "png", "webp", "heic", "avif", "tiff"] as const;

export type PhotoFormat = (typeof PHOTO_FORMATS)[number];

/**
 * Containers the stripper rewrites. HEIC and AVIF keep their metadata in
 * ISO-BMFF item boxes whose offsets are absolute — removing one means
 * rewriting every `iloc` entry after it — and TIFF *is* the metadata format,
 * so all three are read but refused for stripping, by name.
 */
export const STRIPPABLE_FORMATS = ["jpeg", "png", "webp"] as const;

export type StrippableFormat = (typeof STRIPPABLE_FORMATS)[number];

/** What a removed block was, so the report can say what left the file. */
export const METADATA_KINDS = [
    "exif",
    "xmp",
    "iptc",
    "icc",
    "comment",
    "text",
    "time",
    "thumbnail",
    "trailer",
    "other",
] as const;

export type MetadataKind = (typeof METADATA_KINDS)[number];

export type StripOptions = {
    /**
     * Keep the ICC colour profile. On by default: a profile says how to read
     * the colours, not who took the photo, and dropping a wide-gamut one makes
     * the picture look washed out.
     */
    readonly keepColorProfile: boolean;
    /**
     * Keep a minimal EXIF block holding only the orientation. On by default: a
     * phone photo is usually stored sideways with a flag saying so, and
     * without the flag it opens rotated.
     */
    readonly keepOrientation: boolean;
};

export type RemovedBlock = {
    readonly kind: MetadataKind;
    /** How many of these blocks were removed. */
    readonly count: number;
    readonly bytes: number;
};

export type StripFailureReason = "empty" | "too_large" | "unsupported_format" | "malformed";

export type StripSuccess = {
    readonly ok: true;
    readonly format: StrippableFormat;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly removed: readonly RemovedBlock[];
    /** The orientation written back, or `null` when none was kept. */
    readonly keptOrientation: number | null;
    readonly keptColorProfile: boolean;
};

export type StripResult =
    | StripSuccess
    | { readonly ok: false; readonly reason: StripFailureReason; readonly format?: PhotoFormat };

/** The blocks one container walk produced: the kept parts in order, and what was dropped. */
export type ContainerRewrite = {
    readonly parts: readonly Uint8Array[];
    readonly removed: readonly { readonly kind: MetadataKind; readonly bytes: number }[];
    readonly orientation: number | null;
    readonly hadColorProfile: boolean;
};

/** Groups the full tag list is shown in, in this order. */
export const TAG_GROUPS = [
    "ifd0",
    "exif",
    "gps",
    "ifd1",
    "interop",
    "xmp",
    "iptc",
    "icc",
    "jfif",
    "ihdr",
    "comment",
] as const;

export type TagGroupId = (typeof TAG_GROUPS)[number];

export type TagValue =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "bytes"; readonly length: number };

export type TagEntry = { readonly key: string; readonly value: TagValue };

export type TagGroup = { readonly id: TagGroupId; readonly tags: readonly TagEntry[] };

export type GpsPosition = {
    /** Decimal degrees, south and west negative. */
    readonly latitude: number;
    readonly longitude: number;
    /** Metres above sea level, negative below; `null` when the file has none. */
    readonly altitude: number | null;
};

/** The handful of facts most people open a photo's metadata to find. */
export type PhotoFacts = {
    readonly make: string | null;
    readonly model: string | null;
    readonly lens: string | null;
    readonly software: string | null;
    /** As the camera wrote it, `2024-05-01 14:30:15 +06:00`, never re-zoned. */
    readonly takenAt: string | null;
    readonly exposure: string | null;
    readonly aperture: string | null;
    readonly iso: string | null;
    readonly focalLength: string | null;
    readonly orientation: string | null;
    readonly location: GpsPosition | null;
    readonly serialNumbers: readonly string[];
    /** Artist, owner, copyright or by-line — a name somebody put in the file. */
    readonly people: readonly string[];
};

/**
 * Things in the file that identify a person, a place or a device. Ordered by
 * how much they give away: a location is an address.
 */
export const PRIVACY_FINDINGS = [
    "location",
    "people",
    "serial",
    "thumbnail",
    "time",
    "device",
    "software",
    "comment",
] as const;

export type PrivacyFinding = (typeof PRIVACY_FINDINGS)[number];

export type ReadFailureReason = "empty" | "too_large" | "unsupported_format" | "unreadable";

export type ReadSuccess = {
    readonly ok: true;
    readonly format: PhotoFormat;
    readonly groups: readonly TagGroup[];
    readonly facts: PhotoFacts;
    readonly findings: readonly PrivacyFinding[];
    readonly tagCount: number;
};

export type ReadResult = ReadSuccess | { readonly ok: false; readonly reason: ReadFailureReason };

/** Raw metadata blocks lifted out of a container, before any tag is parsed. */
export type MetadataBlocks = {
    /** TIFF bytes, starting at the `II`/`MM` byte-order mark. */
    readonly tiff: Uint8Array | null;
    readonly xmp: Uint8Array | null;
    readonly icc: Uint8Array | null;
    readonly comments: readonly string[];
};
