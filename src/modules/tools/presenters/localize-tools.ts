import "server-only";

import { getMessages } from "next-intl/server";

import { getToolsByCategory } from "../domain/tool-catalog";
import type { LocalizedCategoryGroup, LocalizedTool, Tool } from "../types";

/**
 * Resolves catalog entries against the active locale on the server, so client
 * components never need the full message catalogue just to render a tool name.
 *
 * Reads the catalogue object rather than going through a translator, and that is
 * a deliberate choice with a cost behind it. `t(`${tool.id}.name`)` asks
 * TypeScript to expand every path in both message files into one union — around
 * nine thousand members — and then check a thirty-five-member union against it,
 * twice. That fits until it does not: adding the thirty-fifth tool tipped the
 * checker past its instantiation budget, and the failure surfaced here as two
 * keys that provably exist being reported as missing, while the identical
 * expression in any other file still compiled.
 *
 * Indexing is checked just as strictly — `messages.tools[tool.id]` is a property
 * access on the type generated from `en.json`, so a missing entry is still a
 * compile error — and it costs the checker nothing. These strings also carry no
 * ICU arguments, so nothing is lost by not formatting them.
 */
export async function localizeTools(tools: readonly Tool[]): Promise<LocalizedTool[]> {
    const messages = await getMessages();

    return tools.map((tool) => ({
        ...tool,
        name: messages.tools[tool.id].name,
        description: messages.tools[tool.id].description,
        categoryLabel: messages.categories[tool.category].name,
    }));
}

export async function localizeCategoryGroups(): Promise<LocalizedCategoryGroup[]> {
    const [messages, groups] = await Promise.all([
        getMessages(),
        Promise.resolve(getToolsByCategory()),
    ]);

    return Promise.all(
        groups.map(async (group) => ({
            category: group.category,
            label: messages.categories[group.category].name,
            description: messages.categories[group.category].description,
            availableCount: group.availableCount,
            tools: await localizeTools(group.tools),
        })),
    );
}
