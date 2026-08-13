import { MCP_TOOL_PREFIX } from "./constants";

/**
 * How an MCP tool is named, and why the shape is enforced rather than trusted.
 *
 * A client shows every connected server's tools in one list, and a model picks
 * from that list by name alone. Two consequences decide the format below.
 *
 * **Namespaced, always.** `hash` and `diff` are words half the MCP servers in
 * existence will claim. `toolforge_hash_generate` cannot collide, and when it
 * appears in a transcript the reader can tell where it came from.
 *
 * **`<prefix>_<tool>_<verb>`, in that order.** The catalogue id comes second so
 * an alphabetical tool list groups a tool's operations together — every JWT
 * operation sits beside the others rather than scattered under `decode`,
 * `sign`, and `verify`.
 *
 * Underscores rather than dots or slashes: the protocol permits more, but
 * `[a-z0-9_]` is the intersection every client, model tokenizer and log format
 * handles without escaping.
 */

const NAME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Ceiling on a tool name. Anthropic's tool-use API accepts up to 64 characters,
 * and a name that survives there survives everywhere else.
 */
export const MAX_MCP_TOOL_NAME_LENGTH = 64;

export function buildMcpToolName(toolId: string, verb: string): string {
    return `${MCP_TOOL_PREFIX}_${toolId.replaceAll("-", "_")}_${verb}`;
}

export function isValidMcpToolName(name: string): boolean {
    return (
        name.length <= MAX_MCP_TOOL_NAME_LENGTH &&
        name.startsWith(`${MCP_TOOL_PREFIX}_`) &&
        NAME_PATTERN.test(name)
    );
}
