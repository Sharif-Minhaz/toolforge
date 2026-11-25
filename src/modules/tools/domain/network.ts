import type { Tool } from "../types";

/**
 * Whether a tool is useless without a connection — it is hidden from every
 * list while the browser is offline. A `hybrid` tool is not: its local part
 * still works, and its one online feature says so where it sits.
 *
 * Its own file so a client component can ask without bundling the catalogue.
 */
export function needsNetwork(tool: Pick<Tool, "runsOn">): boolean {
    return tool.runsOn === "server";
}
