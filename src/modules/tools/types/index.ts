export const TOOL_CATEGORIES = [
    "generators",
    "encoding",
    "formatting",
    "security",
    "network",
    "text",
    "media",
    "ai",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/**
 * Canonical tool ids. Declared as a literal union so message keys such as
 * `tools.uuid.name` stay statically checkable.
 */
export const TOOL_IDS = [
    "uuid",
    "base64",
    "jwt",
    "hash",
    "aes",
    "rsa",
    "rsa-encrypt",
    "json",
    "url",
    "url-parser",
    "curl",
    "markdown",
    "regex",
    "lorem",
    "color",
    "cron",
    "timestamp",
    "password",
    "secret",
    "qr",
    "shortener",
    "slug",
    "text-case",
    "equation",
    "diff",
    "image-compressor",
    "image-converter",
    "image-resizer",
    "background-remover",
    "blur-placeholder",
    "ai-image-detector",
    "ai-text-detector",
    "watermark-remover",
    "domain-inspector",
    "bson",
    "port-scanner",
    "mock-server",
    "json-server",
    "graphql-server",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type ToolStatus = "available" | "planned";

/**
 * Where a tool's work actually happens, and therefore whether anything a
 * visitor types can leave their machine.
 *
 * `"browser"` is the promise the front page makes: no request carries the
 * input anywhere. `"server"` is a tool that cannot keep it — a raw socket, a
 * DNS lookup, a model, a stored row — and every one of those says so in its own
 * copy. `"hybrid"` is local by default with one opt-in feature that is not: a
 * static QR code is drawn in the tab, a dynamic one has to store its
 * destination.
 *
 * Counted rather than asserted, because "100% client-side" stopped being true
 * the moment the first server-backed tool shipped.
 */
export type ToolRuntime = "browser" | "hybrid" | "server";

/** Decorative hue, mapped to a `--brand-*` token by the UI layer. */
export type ToolAccent = "violet" | "cyan" | "amber" | "rose" | "emerald";

/**
 * Icon identity is kept as a string so the domain layer stays free of React.
 * The UI layer resolves it to a Tabler icon component.
 */
export type ToolIconName =
    | "fingerprint"
    | "binary"
    | "key"
    | "hash"
    | "braces"
    | "link"
    | "world"
    | "markdown"
    | "regex"
    | "text"
    | "palette"
    | "clock"
    | "calendar"
    | "lock"
    | "qrcode"
    | "scissors"
    | "slug"
    | "case"
    | "math"
    | "diff"
    | "photo"
    | "scan"
    | "eraser"
    | "background"
    | "compress"
    | "crop"
    | "transform"
    | "blur"
    | "terminal"
    | "radar"
    | "database"
    | "network"
    | "server"
    | "graph"
    | "shield"
    | "certificate"
    | "lock-code"
    | "dice";

export type Tool = {
    readonly id: ToolId;
    readonly href: string;
    /**
     * True for a whole section — a route tree with its own navigation rather
     * than a single page. A section is findable in search and appears in the
     * sitemap, but is left out of the category rail, the featured and popular
     * grids and the related-tools strip, where a multi-page app sitting between
     * two single-page utilities reads as a mistake. It also opts out of the
     * `/tools/<id>` route rule, which a section cannot satisfy.
     */
    readonly isSection?: boolean;
    readonly category: ToolCategory;
    readonly status: ToolStatus;
    readonly runsOn: ToolRuntime;
    readonly accent: ToolAccent;
    readonly icon: ToolIconName;
    /** ISO-8601 date the tool shipped, or is expected to. */
    readonly addedOn: string;
    readonly featured: boolean;
    /** Ranking hint used by "popular tools"; higher comes first. */
    readonly popularity: number;
    /**
     * Alternate names a person might search for — abbreviations, the underlying
     * spec, the API they know it by. Feeds both the catalog search and the page
     * `keywords` meta tag, so it stays lowercase and untranslated: these are
     * technical terms developers type in English in either locale.
     */
    readonly keywords: readonly string[];
};

/** A catalog entry with its display strings resolved for the active locale. */
export type LocalizedTool = Tool & {
    readonly name: string;
    readonly description: string;
    readonly categoryLabel: string;
};

/**
 * Broken-down wall-clock fields, always relative to some named zone. Shared by
 * every tool that has to reason about a calendar rather than an instant.
 */
export type ZonedFields = {
    readonly year: number;
    /** 1–12, not the `Date` 0–11. */
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
};

/** Which family an address belongs to. Shared by every tool that reads one. */
export type IpVersion = 4 | 6;

export const NEWLINE_SEPARATORS = ["lf", "crlf", "cr"] as const;

export type NewlineSeparator = (typeof NEWLINE_SEPARATORS)[number];

/**
 * How a text ↔ bytes conversion can fail, shared by every tool that moves text
 * through a character set. Individual tools widen this with reasons of their
 * own; the codec itself only ever raises these three.
 */
export type TextCodecFailureReason =
    "undecodable_text" | "unencodable_character" | "unsupported_charset";

export type TextCodecFailure = {
    readonly ok: false;
    readonly reason: TextCodecFailureReason;
    /** 1-based index of the offending character, when one can be pinpointed. */
    readonly position?: number;
    /** 1-based line, set only while converting each line separately. */
    readonly line?: number;
};

/**
 * Bytes on their way to Web Crypto.
 *
 * `BufferSource` refuses a `Uint8Array` that might be backed by a
 * `SharedArrayBuffer`. Nothing here ever is, so the buffer type is named once
 * rather than asserted at every call site.
 */
export type CipherBytes = Uint8Array<ArrayBuffer>;

/**
 * The three ways a plaintext payload can be written, shared by every tool with
 * a "what is in this box" picker over it.
 */
export const PAYLOAD_TEXT_ENCODINGS = ["utf-8", "hex", "base64"] as const;

export type PayloadTextEncoding = (typeof PAYLOAD_TEXT_ENCODINGS)[number];

/** The same for a payload that was never text. Never UTF-8: ciphertext is not text. */
export const PAYLOAD_BINARY_ENCODINGS = ["hex", "base64"] as const;

export type PayloadBinaryEncoding = (typeof PAYLOAD_BINARY_ENCODINGS)[number];

/**
 * Which DER container an RSA key is written into, shared by the generator and
 * the encryption tool.
 *
 * `pkcs8` is the modern pair — `PRIVATE KEY` wrapping the RSA numbers next to an
 * algorithm identifier, with `PUBLIC KEY` (SubjectPublicKeyInfo) opposite it.
 * `pkcs1` is the bare RSA structure that predates both, written as
 * `RSA PRIVATE KEY` and `RSA PUBLIC KEY`, and is what a great deal of older
 * tooling still expects.
 */
export const RSA_KEY_FORMATS = ["pkcs8", "pkcs1"] as const;

export type RsaKeyFormat = (typeof RSA_KEY_FORMATS)[number];

/** Which half of a key pair an operation, a copy or a download is about. */
export const RSA_KEY_KINDS = ["public", "private"] as const;

export type RsaKeyKind = (typeof RSA_KEY_KINDS)[number];

/** The four PEM headers an RSA key can carry, keyed by what they hold. */
export const PEM_LABELS = {
    spki: "PUBLIC KEY",
    pkcs8: "PRIVATE KEY",
    pkcs1Public: "RSA PUBLIC KEY",
    pkcs1Private: "RSA PRIVATE KEY",
} as const;

export type PemLabel = (typeof PEM_LABELS)[keyof typeof PEM_LABELS];

export type EncodeBytesResult =
    { readonly ok: true; readonly bytes: Uint8Array } | TextCodecFailure;

export type DecodeTextResult = { readonly ok: true; readonly text: string } | TextCodecFailure;

/**
 * The four still-image formats this site can write, shared by every tool that
 * hands pixels to a codec. Ordered lossy-first, which is the order the format
 * pickers read in.
 */
export const RASTER_FORMATS = ["webp", "avif", "jpeg", "png"] as const;

export type RasterFormat = (typeof RASTER_FORMATS)[number];

/**
 * The image types `tools/domain/image-codec.ts` can decode. Wider than
 * `RASTER_FORMATS`: a GIF or a BMP is readable by every browser and worth
 * re-encoding, but nothing here writes either.
 */
export const DECODABLE_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
    "image/bmp",
] as const;

export type DecodableImageType = (typeof DECODABLE_IMAGE_TYPES)[number];

export type PixelSize = {
    readonly width: number;
    readonly height: number;
};

/** A flattening colour for pixels on their way into a format with no alpha. */
export type MatteColor = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
};

/** One member of a ZIP built by `tools/domain/archive.ts`. */
export type ArchiveEntry = {
    readonly name: string;
    readonly bytes: Uint8Array;
};

export const BYTE_UNITS = ["b", "kb", "mb"] as const;

export type ByteUnit = (typeof BYTE_UNITS)[number];

/** Locale-free size description; the UI renders the unit from its catalogue. */
export type ByteSize = {
    readonly value: number;
    readonly unit: ByteUnit;
};

/** A generated file handed to the browser's download flow. */
export type DownloadFile = {
    readonly filename: string;
    readonly mimeType: string;
    readonly content: string;
};

/** The same, for a file that was never text — the blob carries its own type. */
export type BlobDownload = {
    readonly filename: string;
    readonly blob: Blob;
};

export type ToolCatalogStats = {
    readonly available: number;
    readonly planned: number;
    readonly total: number;
    readonly categories: number;
    /** Shipped tools that send nothing anywhere — `runsOn: "browser"` only. */
    readonly browserOnly: number;
};

export type ToolCategoryGroup = {
    readonly category: ToolCategory;
    readonly tools: readonly Tool[];
    readonly availableCount: number;
};

export type LocalizedCategoryGroup = {
    readonly category: ToolCategory;
    readonly label: string;
    readonly description: string;
    readonly tools: readonly LocalizedTool[];
    readonly availableCount: number;
};

/**
 * Injected wherever randomness is used, so every branch — including the
 * rejection-sampling retry — can be pinned by a test. The browser default is
 * `crypto.getRandomValues`; nothing here ever falls back to `Math.random`.
 */
export type RandomBytes = (length: number) => Uint8Array;

/**
 * How the public name of a hosted server can fail to be one. Shared by every
 * studio that hands out a `/<prefix>/<key>/…` address — see
 * `tools/domain/server-key.ts`.
 *
 * The members are message keys as well as reasons, so renaming one means
 * renaming it in both locale catalogues too.
 */
export const SERVER_KEY_PROBLEMS = [
    "empty_key",
    "too_short",
    "too_long",
    "invalid_characters",
    "edge_hyphen",
    "double_hyphen",
    "reserved",
] as const;

export type ServerKeyProblem = (typeof SERVER_KEY_PROBLEMS)[number];

export type ServerKeyResult =
    | { readonly ok: true; readonly key: string }
    | { readonly ok: false; readonly reason: ServerKeyProblem };

/**
 * One visitor's spend inside one fixed window, as stored. Shared by every tool
 * that meters a public action — see `tools/domain/quota-window.ts`.
 */
export type QuotaRow = {
    readonly count: number;
    readonly windowStart: Date;
};

/** The same allowance, described for the UI. */
export type QuotaState = {
    readonly limit: number;
    readonly used: number;
    readonly remaining: number;
    /** ISO-8601. The whole report crosses a Server Action boundary. */
    readonly resetsAt: string;
};
