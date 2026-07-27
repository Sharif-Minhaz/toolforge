export const TOOL_CATEGORIES = [
    "generators",
    "encoding",
    "formatting",
    "security",
    "text",
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
    "json",
    "url",
    "regex",
    "lorem",
    "color",
    "cron",
    "timestamp",
    "password",
    "qr",
    "slug",
    "diff",
    "ai-image-detector",
    "ai-text-detector",
    "gemini-watermark-remover",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type ToolStatus = "available" | "planned";

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
    | "regex"
    | "text"
    | "palette"
    | "clock"
    | "calendar"
    | "lock"
    | "qrcode"
    | "slug"
    | "diff"
    | "photo"
    | "scan"
    | "eraser";

export type Tool = {
    readonly id: ToolId;
    readonly href: string;
    readonly category: ToolCategory;
    readonly status: ToolStatus;
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

export type ToolCatalogStats = {
    readonly available: number;
    readonly planned: number;
    readonly total: number;
    readonly categories: number;
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
