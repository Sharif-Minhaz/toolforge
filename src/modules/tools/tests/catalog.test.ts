import { describe, expect, test } from "bun:test";

import { filterTools, matchesToolQuery } from "@/modules/tools/domain/search";
import {
    getAvailableTools,
    getFeaturedTools,
    getPopularTools,
    getRecentTools,
    getRelatedTools,
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

    test("routes every single-page tool under /tools", () => {
        for (const tool of getTools().filter((tool) => tool.isSection !== true)) {
            expect(tool.href).toBe(`/tools/${tool.id}`);
        }
    });

    /**
     * A section is a route tree with its own navigation, so it cannot satisfy
     * the rule above. What it must still do is own a root nobody else can
     * claim — otherwise the exception becomes a way to smuggle a tool onto any
     * path at all.
     */
    test("gives every section its own top-level root", () => {
        const sections = getTools().filter((tool) => tool.isSection === true);
        const roots = sections.map((tool) => tool.href);

        for (const href of roots) {
            expect(href).toMatch(/^\/[a-z0-9-]+$/);
            expect(href.startsWith("/tools/")).toBe(false);
        }

        expect(new Set(roots).size).toBe(roots.length);
    });

    /**
     * Sections are findable in search and in the sitemap, and absent from every
     * grid that ranks single-page utilities — a multi-page app between two of
     * them reads as a mistake rather than as a suggestion.
     */
    test("keeps sections out of the ranked grids", () => {
        const isSection = (tool: { isSection?: boolean }) => tool.isSection === true;

        expect(getFeaturedTools(50).some(isSection)).toBe(false);
        expect(getPopularTools(50).some(isSection)).toBe(false);
        expect(getRecentTools(50).some(isSection)).toBe(false);
        expect(getRelatedTools("uuid", 50).some(isSection)).toBe(false);
        expect(
            getToolsByCategory()
                .flatMap((group) => group.tools)
                .some(isSection),
        ).toBe(false);
    });

    test("still lists sections among the available tools, so search finds them", () => {
        expect(getAvailableTools().some((tool) => tool.isSection === true)).toBe(true);
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

    test("ships the random text generator", () => {
        const lorem = getToolById("lorem");

        expect(lorem?.status).toBe("available");
        expect(lorem?.href).toBe("/tools/lorem");
    });

    test("ships the colour converter", () => {
        const color = getToolById("color");

        expect(color?.status).toBe("available");
        expect(color?.href).toBe("/tools/color");
    });

    test("ships the slug generator", () => {
        const slug = getToolById("slug");

        expect(slug?.status).toBe("available");
        expect(slug?.href).toBe("/tools/slug");
    });

    test("counts available and planned tools consistently", () => {
        const stats = getToolCatalogStats();

        expect(stats.available).toBe(getAvailableTools().length);
        expect(stats.available + stats.planned).toBe(stats.total);
        expect(stats.total).toBe(getTools().length);
        expect(stats.categories).toBe(TOOL_CATEGORIES.length);
    });

    test("groups every single-page tool into exactly one category", () => {
        const groups = getToolsByCategory();
        const grouped = groups.flatMap((group) => group.tools);
        const pages = getTools().filter((tool) => tool.isSection !== true);

        // Sections are deliberately absent — they have their own rail above the
        // category headings — so the count is of pages, not of every entry.
        expect(grouped).toHaveLength(pages.length);
        expect(new Set(grouped.map((tool) => tool.id)).size).toBe(pages.length);
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

describe("getRelatedTools", () => {
    test("suggests three shipped tools by default", () => {
        const related = getRelatedTools("uuid");

        expect(related).toHaveLength(3);

        for (const tool of related) {
            expect(tool.status).toBe("available");
        }
    });

    test("never suggests the tool the reader is already on", () => {
        for (const tool of getAvailableTools()) {
            expect(getRelatedTools(tool.id).map((related) => related.id)).not.toContain(tool.id);
        }
    });

    test("leads with neighbours from the same category", () => {
        // Base64 is the other shipped encoding tool, and less popular than
        // several tools elsewhere in the catalog — so category has to win.
        expect(getRelatedTools("url")[0]?.id).toBe("base64");
    });

    test("falls back to popularity once the category runs out", () => {
        // The limit has to exceed the category, or there is no fallback to
        // observe — encoding has grown since this was first written.
        const related = getRelatedTools("url", 8);
        const beyondCategory = related.filter((tool) => tool.category !== "encoding");
        const popularity = beyondCategory.map((tool) => tool.popularity);

        expect(beyondCategory.length).toBeGreaterThan(0);
        expect(popularity).toEqual(popularity.toSorted((a, b) => b - a));
    });

    test("honours the requested limit", () => {
        expect(getRelatedTools("uuid", 2)).toHaveLength(2);
        expect(getRelatedTools("uuid", 0)).toHaveLength(0);
    });

    test("still suggests something for a tool that has not shipped yet", () => {
        const related = getRelatedTools("diff");

        expect(related).toHaveLength(3);
        expect(related.map((tool) => tool.id)).not.toContain("diff");
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
