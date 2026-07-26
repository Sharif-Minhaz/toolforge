/** The fields the catalog search reads. Keeps the filter usable from any layer. */
export type SearchableTool = {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly categoryLabel: string;
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
        tool.id.toLowerCase().includes(needle)
    );
}

export function filterTools<T extends SearchableTool>(tools: readonly T[], query: string): T[] {
    return tools.filter((tool) => matchesToolQuery(tool, query));
}
