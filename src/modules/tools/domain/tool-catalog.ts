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
    },
    {
        id: "jwt",
        href: "/tools/jwt",
        category: "security",
        status: "planned",
        accent: "rose",
        icon: "key",
        addedOn: "2026-08-06",
        featured: true,
        popularity: 88,
    },
    {
        id: "hash",
        href: "/tools/hash",
        category: "security",
        status: "planned",
        accent: "emerald",
        icon: "hash",
        addedOn: "2026-08-08",
        featured: true,
        popularity: 84,
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
