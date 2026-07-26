import "server-only";

import { getTranslations } from "next-intl/server";

import { getToolsByCategory } from "../domain/tool-catalog";
import type { LocalizedCategoryGroup, LocalizedTool, Tool } from "../types";

/**
 * Resolves catalog entries against the active locale on the server, so client
 * components never need the full message catalogue just to render a tool name.
 */
export async function localizeTools(tools: readonly Tool[]): Promise<LocalizedTool[]> {
    const [t, tCategories] = await Promise.all([
        getTranslations("tools"),
        getTranslations("categories"),
    ]);

    return tools.map((tool) => ({
        ...tool,
        name: t(`${tool.id}.name`),
        description: t(`${tool.id}.description`),
        categoryLabel: tCategories(`${tool.category}.name`),
    }));
}

export async function localizeCategoryGroups(): Promise<LocalizedCategoryGroup[]> {
    const [tCategories, groups] = await Promise.all([
        getTranslations("categories"),
        Promise.resolve(getToolsByCategory()),
    ]);

    return Promise.all(
        groups.map(async (group) => ({
            category: group.category,
            label: tCategories(`${group.category}.name`),
            description: tCategories(`${group.category}.description`),
            availableCount: group.availableCount,
            tools: await localizeTools(group.tools),
        })),
    );
}
