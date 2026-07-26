import { describe, expect, test } from "bun:test";

import { filterTools, matchesToolQuery } from "@/modules/tools/domain/search";
import {
    getAvailableTools,
    getFeaturedTools,
    getPopularTools,
    getRecentTools,
    getToolById,
    getToolCatalogStats,
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

    test("returns nothing when the query matches no field", () => {
        expect(filterTools(SEARCHABLE, "kubernetes")).toHaveLength(0);
    });
});
