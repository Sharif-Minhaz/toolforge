import {
    TOOL_CATEGORIES,
    type Tool,
    type ToolCatalogStats,
    type ToolCategory,
    type ToolCategoryGroup,
    type ToolId,
} from "../types";

/**
 * Single source of truth for every tool ToolForge exposes or has queued.
 * Display names and descriptions live in the message catalogue under
 * `tools.<id>` so the registry itself stays locale-agnostic.
 */
const TOOLS: readonly Tool[] = [
    {
        id: "uuid",
        href: "/tools/uuid",
        category: "generators",
        status: "available",
        accent: "violet",
        icon: "fingerprint",
        addedOn: "2026-07-27",
        featured: true,
        popularity: 100,
        keywords: [
            "guid",
            "uuid v4",
            "uuid v7",
            "uuid v1",
            "unique id",
            "random id",
            "rfc 9562",
            "identifier",
        ],
    },
    {
        id: "base64",
        href: "/tools/base64",
        category: "encoding",
        status: "available",
        accent: "cyan",
        icon: "binary",
        addedOn: "2026-07-27",
        featured: true,
        popularity: 92,
        keywords: [
            "b64",
            "base64url",
            "data uri",
            "atob",
            "btoa",
            "mime",
            "encode",
            "decode",
            "binary to text",
        ],
    },
    {
        id: "jwt",
        href: "/tools/jwt",
        category: "security",
        status: "available",
        accent: "rose",
        icon: "key",
        addedOn: "2026-07-27",
        featured: true,
        popularity: 88,
        keywords: [
            "json web token",
            "bearer token",
            "claims",
            "payload",
            "rfc 7519",
            "auth token",
            "decode jwt",
            "jws",
            "hs256",
            "rs256",
            "verify signature",
            "sign token",
        ],
    },
    {
        id: "hash",
        href: "/tools/hash",
        category: "security",
        status: "available",
        accent: "emerald",
        icon: "hash",
        addedOn: "2026-07-27",
        featured: true,
        popularity: 84,
        keywords: [
            "sha-256",
            "sha-1",
            "sha-512",
            "md5",
            "checksum",
            "digest",
            "fingerprint",
            "message digest",
            "bcrypt",
            "argon2",
            "argon2id",
            "password hash",
            "salt",
            "cost factor",
            "verify hash",
            "compare hash",
        ],
    },
    {
        id: "json",
        href: "/tools/json",
        category: "formatting",
        status: "planned",
        accent: "amber",
        icon: "braces",
        addedOn: "2026-08-11",
        featured: true,
        popularity: 90,
        keywords: [
            "pretty print",
            "beautify",
            "minify",
            "validate",
            "formatter",
            "stringify",
            "indent",
        ],
    },
    {
        id: "url",
        href: "/tools/url",
        category: "encoding",
        status: "planned",
        accent: "cyan",
        icon: "link",
        addedOn: "2026-08-13",
        featured: false,
        popularity: 70,
        keywords: [
            "percent encoding",
            "encodeuricomponent",
            "query string",
            "escape",
            "urlencode",
            "uri",
        ],
    },
    {
        id: "regex",
        href: "/tools/regex",
        category: "text",
        status: "planned",
        accent: "violet",
        icon: "regex",
        addedOn: "2026-08-15",
        featured: true,
        popularity: 78,
        keywords: [
            "regular expression",
            "pattern",
            "regexp",
            "match",
            "capture group",
            "test pattern",
        ],
    },
    {
        id: "lorem",
        href: "/tools/lorem",
        category: "text",
        status: "planned",
        accent: "amber",
        icon: "text",
        addedOn: "2026-08-18",
        featured: false,
        popularity: 52,
        keywords: [
            "placeholder text",
            "dummy text",
            "filler text",
            "ipsum",
            "sample copy",
            "mock text",
        ],
    },
    {
        id: "color",
        href: "/tools/color",
        category: "formatting",
        status: "planned",
        accent: "rose",
        icon: "palette",
        addedOn: "2026-08-20",
        featured: false,
        popularity: 66,
        keywords: ["hex", "rgb", "hsl", "oklch", "colour", "converter", "palette", "contrast"],
    },
    {
        id: "cron",
        href: "/tools/cron",
        category: "formatting",
        status: "planned",
        accent: "emerald",
        icon: "clock",
        addedOn: "2026-08-22",
        featured: false,
        popularity: 58,
        keywords: ["crontab", "schedule", "cron expression", "quartz", "next run", "job timing"],
    },
    {
        id: "timestamp",
        href: "/tools/timestamp",
        category: "formatting",
        status: "planned",
        accent: "cyan",
        icon: "calendar",
        addedOn: "2026-08-25",
        featured: false,
        popularity: 74,
        keywords: ["unix time", "epoch", "iso 8601", "date converter", "milliseconds", "utc"],
    },
    {
        id: "password",
        href: "/tools/password",
        category: "security",
        status: "planned",
        accent: "violet",
        icon: "lock",
        addedOn: "2026-08-27",
        featured: false,
        popularity: 80,
        keywords: [
            "passphrase",
            "random password",
            "secure password",
            "entropy",
            "strong password",
        ],
    },
    {
        id: "qr",
        href: "/tools/qr",
        category: "generators",
        status: "planned",
        accent: "amber",
        icon: "qrcode",
        addedOn: "2026-08-29",
        featured: false,
        popularity: 62,
        keywords: ["qr code", "barcode", "scan", "vcard", "wifi qr"],
    },
    {
        id: "slug",
        href: "/tools/slug",
        category: "text",
        status: "planned",
        accent: "emerald",
        icon: "slug",
        addedOn: "2026-09-01",
        featured: false,
        popularity: 48,
        keywords: ["url slug", "permalink", "kebab case", "seo url", "sanitize", "transliterate"],
    },
    {
        id: "diff",
        href: "/tools/diff",
        category: "text",
        status: "planned",
        accent: "rose",
        icon: "diff",
        addedOn: "2026-09-03",
        featured: false,
        popularity: 56,
        keywords: ["compare", "text diff", "changes", "patch", "side by side", "unified diff"],
    },
];

export function getTools(): readonly Tool[] {
    return TOOLS;
}

export function getToolById(id: ToolId): Tool | undefined {
    return TOOLS.find((tool) => tool.id === id);
}

export function getAvailableTools(): readonly Tool[] {
    return TOOLS.filter((tool) => tool.status === "available");
}

/**
 * Search terms for the site-wide `keywords` meta tag. Planned tools are left
 * out: promising a QR generator that does not exist yet earns a bounce, not a
 * visitor.
 */
export function getToolKeywords(): readonly string[] {
    return [...new Set(getAvailableTools().flatMap((tool) => tool.keywords))];
}

/** Hand-picked tools for the overview grid, most popular first. */
export function getFeaturedTools(limit = 6): readonly Tool[] {
    return TOOLS.filter((tool) => tool.featured)
        .toSorted((a, b) => b.popularity - a.popularity)
        .slice(0, limit);
}

export function getPopularTools(limit = 4): readonly Tool[] {
    return TOOLS.toSorted((a, b) => b.popularity - a.popularity).slice(0, limit);
}

/** Newest first, so the overview can surface what just landed. */
export function getRecentTools(limit = 4): readonly Tool[] {
    return TOOLS.toSorted((a, b) => b.addedOn.localeCompare(a.addedOn)).slice(0, limit);
}

export function getToolsByCategory(): readonly ToolCategoryGroup[] {
    return TOOL_CATEGORIES.map((category) => {
        const tools = TOOLS.filter((tool) => tool.category === category);

        return {
            category,
            tools,
            availableCount: tools.filter((tool) => tool.status === "available").length,
        } satisfies ToolCategoryGroup;
    });
}

export function getToolsInCategory(category: ToolCategory): readonly Tool[] {
    return TOOLS.filter((tool) => tool.category === category);
}

export function getToolCatalogStats(): ToolCatalogStats {
    const available = getAvailableTools().length;

    return {
        available,
        planned: TOOLS.length - available,
        total: TOOLS.length,
        categories: TOOL_CATEGORIES.length,
    };
}
