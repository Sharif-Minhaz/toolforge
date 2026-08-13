import type { McpTool, McpToolKind } from "../types";
import { isValidMcpToolName } from "./tool-name";

/**
 * Lookup and invariants over whatever `tools/index.ts` collected.
 *
 * Kept apart from the collection itself so the rules can be tested against a
 * handful of fixtures rather than against the real thirty — and so that adding
 * a tool means editing one array, never this file.
 */

export function findMcpTool(tools: readonly McpTool[], name: string): McpTool | undefined {
    return tools.find((tool) => tool.name === name);
}

export function listMcpToolsOfKind(
    tools: readonly McpTool[],
    kind: McpToolKind,
): readonly McpTool[] {
    return tools.filter((tool) => tool.kind === kind);
}

/**
 * Everything that must hold across the whole registry, in one pass.
 *
 * Returns the problems rather than throwing them, because the caller is a test:
 * a duplicate name is a defect to be reported at build time with all its
 * siblings, not a crash on the first one at request time.
 */
export function findRegistryProblems(tools: readonly McpTool[]): readonly string[] {
    const problems: string[] = [];
    const seen = new Set<string>();

    for (const tool of tools) {
        if (seen.has(tool.name)) {
            problems.push(`duplicate tool name: ${tool.name}`);
        }

        seen.add(tool.name);

        if (!isValidMcpToolName(tool.name)) {
            problems.push(`malformed tool name: ${tool.name}`);
        }

        if (tool.description.trim().length === 0) {
            problems.push(`missing description: ${tool.name}`);
        }

        if (tool.title.trim().length === 0) {
            problems.push(`missing title: ${tool.name}`);
        }
    }

    return problems;
}
