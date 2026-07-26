export const TOOL_CATEGORIES = [
    "generators",
    "encoding",
    "formatting",
    "security",
    "text",
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
    | "diff";

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
};

/** A catalog entry with its display strings resolved for the active locale. */
export type LocalizedTool = Tool & {
    readonly name: string;
    readonly description: string;
    readonly categoryLabel: string;
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
