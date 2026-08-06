/** What the sidebar's filter box accepts; nothing longer can match a tool name. */
export const MAX_TOOL_SEARCH_LENGTH = 64;

/** The fields the catalog search reads. Keeps the filter usable from any layer. */
export type SearchableTool = {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly categoryLabel: string;
    /** Optional so any object with the display fields can still be filtered. */
    readonly keywords?: readonly string[];
};

export function matchesToolQuery(tool: SearchableTool, query: string): boolean {
    const needle = query.trim().toLowerCase();

    if (needle.length === 0) {
        return true;
    }

    return (
        tool.name.toLowerCase().includes(needle) ||
        tool.description.toLowerCase().includes(needle) ||
        tool.categoryLabel.toLowerCase().includes(needle) ||
        tool.id.toLowerCase().includes(needle) ||
        // Lets "guid" find the UUID generator and "btoa" find Base64, which the
        // display strings alone never would.
        (tool.keywords?.some((keyword) => keyword.includes(needle)) ?? false)
    );
}

export function filterTools<T extends SearchableTool>(tools: readonly T[], query: string): T[] {
    return tools.filter((tool) => matchesToolQuery(tool, query));
}
