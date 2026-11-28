import { absoluteUrl, SITE_REPOSITORY, SITE_REPOSITORY_BRANCH } from "@/modules/seo/domain/site";
import type { ToolId } from "../types";
import { getToolById } from "./tool-catalog";

/**
 * Where a tool lives in the public repository, and where to report a problem
 * with it — the two links behind every tool header's "Improve" menu.
 */

/**
 * The tools whose module directory is not named after their id. Everything
 * else lives at `src/modules/<id>`; `tool-source.test.ts` checks every id
 * against the disk, so a rename that forgets this table fails there instead
 * of shipping a dead link.
 */
const MODULE_DIRECTORY_OVERRIDES: Partial<Record<ToolId, string>> = {
    "zakat-calculator": "zakat",
};

/** The issue form in `.github/ISSUE_TEMPLATE/`, whose field ids the query below fills. */
export const TOOL_ISSUE_TEMPLATE = "tool-problem.yml";

export type ToolSourceLinks = {
    /** A new issue, already naming the tool and its page. */
    readonly issueUrl: string;
    /** The tool's module directory on the default branch. */
    readonly sourceUrl: string;
};

export function toolModuleDirectory(toolId: ToolId): string {
    return `src/modules/${MODULE_DIRECTORY_OVERRIDES[toolId] ?? toolId}`;
}

/**
 * Both links for one tool. The page address is the catalogue route with no
 * query: several tools keep what the reader typed in the query (a date of
 * birth, a JWT), and none of it belongs in a public issue.
 */
export function toolSourceLinks(toolId: ToolId): ToolSourceLinks {
    const href = getToolById(toolId)?.href ?? `/tools/${toolId}`;
    const issue = new URLSearchParams({
        template: TOOL_ISSUE_TEMPLATE,
        title: `[${toolId}] `,
        tool: toolId,
        page: absoluteUrl(href),
    });

    return {
        issueUrl: `${SITE_REPOSITORY}/issues/new?${issue.toString()}`,
        sourceUrl: `${SITE_REPOSITORY}/tree/${SITE_REPOSITORY_BRANCH}/${toolModuleDirectory(toolId)}`,
    };
}
