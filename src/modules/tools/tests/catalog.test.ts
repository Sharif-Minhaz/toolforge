import { describe, expect, test } from "bun:test";

import { filterTools, matchesToolQuery } from "@/modules/tools/domain/search";
import {
    getAvailableTools,
    getFeaturedTools,
    getPopularTools,
    getRecentTools,
    getToolById,
    getToolCatalogStats,
    getToolKeywords,
    getTools,
    getToolsByCategory,
} from "@/modules/tools/domain/tool-catalog";
import { TOOL_CATEGORIES } from "@/modules/tools/types";

const SEARCHABLE = [
    {
        id: "uuid",
        name: "UUID Generator",
        description: "Generate v4 ids",
        categoryLabel: "Generators",
        keywords: ["guid", "unique id"],
    },
    {
        id: "json",
        name: "JSON Formatter",
        description: "Prettify payloads",
        categoryLabel: "Formatting",
    },
];

describe("tool catalog", () => {
    test("exposes a unique id for every entry", () => {
        const ids = getTools().map((tool) => tool.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test("routes every tool under /tools", () => {
        for (const tool of getTools()) {
            expect(tool.href).toBe(`/tools/${tool.id}`);
        }
    });

    test("ships the UUID generator", () => {
        const uuid = getToolById("uuid");

        expect(uuid?.status).toBe("available");
        expect(uuid?.href).toBe("/tools/uuid");
    });

    test("ships the Base64 converter", () => {
        const base64 = getToolById("base64");

        expect(base64?.status).toBe("available");
        expect(base64?.href).toBe("/tools/base64");
    });

    test("ships the Markdown editor", () => {
        const markdown = getToolById("markdown");

        expect(markdown?.status).toBe("available");
        expect(markdown?.href).toBe("/tools/markdown");
    });

    test("counts available and planned tools consistently", () => {
        const stats = getToolCatalogStats();

        expect(stats.available).toBe(getAvailableTools().length);
        expect(stats.available + stats.planned).toBe(stats.total);
        expect(stats.total).toBe(getTools().length);
        expect(stats.categories).toBe(TOOL_CATEGORIES.length);
    });

    test("groups every tool into exactly one category", () => {
        const groups = getToolsByCategory();
        const grouped = groups.flatMap((group) => group.tools);

        expect(grouped).toHaveLength(getTools().length);
        expect(groups.map((group) => group.category)).toEqual([...TOOL_CATEGORIES]);
    });

    test("returns featured tools ordered by popularity", () => {
        const popularity = getFeaturedTools(6).map((tool) => tool.popularity);

        expect(popularity).toEqual(popularity.toSorted((a, b) => b - a));
    });

    test("returns recent tools newest first", () => {
        const dates = getRecentTools(5).map((tool) => tool.addedOn);

        expect(dates).toEqual(dates.toSorted((a, b) => b.localeCompare(a)));
    });

    test("honours the requested limit", () => {
        expect(getPopularTools(3)).toHaveLength(3);
        expect(getRecentTools(2)).toHaveLength(2);
    });
});

describe("matchesToolQuery", () => {
    test("returns every tool for a blank query", () => {
        expect(filterTools(SEARCHABLE, "   ")).toHaveLength(2);
    });

    test("matches the display name regardless of case", () => {
        expect(filterTools(SEARCHABLE, "uuid gen")).toHaveLength(1);
        expect(filterTools(SEARCHABLE, "JSON")).toHaveLength(1);
    });

    test("matches on description and category too", () => {
        expect(matchesToolQuery(SEARCHABLE[0], "generate v4")).toBe(true);
        expect(matchesToolQuery(SEARCHABLE[1], "formatting")).toBe(true);
    });

    test("matches an alternate name the display strings never mention", () => {
        // "guid" appears in no name, description, category, or id.
        expect(matchesToolQuery(SEARCHABLE[0], "guid")).toBe(true);
        expect(matchesToolQuery(SEARCHABLE[0], "GUID")).toBe(true);
    });

    test("tolerates a tool with no keywords at all", () => {
        expect(matchesToolQuery(SEARCHABLE[1], "json")).toBe(true);
        expect(matchesToolQuery(SEARCHABLE[1], "guid")).toBe(false);
    });

    test("returns nothing when the query matches no field", () => {
        expect(filterTools(SEARCHABLE, "kubernetes")).toHaveLength(0);
    });
});

describe("tool keywords", () => {
    test("gives every catalog entry at least one alternate search term", () => {
        for (const tool of getTools()) {
            expect(tool.keywords.length).toBeGreaterThan(0);
        }
    });

    test("keeps keywords lowercase, since the query is lowercased before matching", () => {
        for (const tool of getTools()) {
            for (const keyword of tool.keywords) {
                expect(keyword).toBe(keyword.toLowerCase());
            }
        }
    });

    test("never repeats a keyword inside one entry", () => {
        for (const tool of getTools()) {
            expect(new Set(tool.keywords).size).toBe(tool.keywords.length);
        }
    });

    test("collects meta-tag keywords from shipped tools only", () => {
        const keywords = getToolKeywords();
        const planned = getTools().filter((tool) => tool.status === "planned");

        expect(keywords).toEqual([...new Set(keywords)]);

        for (const tool of getAvailableTools()) {
            expect(keywords).toEqual(expect.arrayContaining([...tool.keywords]));
        }

        // A term only a planned tool claims must not leak into the tag.
        const shipped = new Set(getAvailableTools().flatMap((tool) => tool.keywords));
        const plannedOnly = planned
            .flatMap((tool) => tool.keywords)
            .filter((keyword) => !shipped.has(keyword));

        for (const keyword of plannedOnly) {
            expect(keywords).not.toContain(keyword);
        }
    });
});
