/**
 * What the MCP endpoint calls itself, and the ceilings it holds callers to.
 *
 * Every bound here exists because the caller is a program rather than a person.
 * A tool page can rely on somebody noticing that a text area has gone quiet; an
 * MCP client notices nothing and retries, so each limit below has to be a
 * number rather than a judgement.
 */

/** Name shown in a client's connector list. */
export const MCP_SERVER_NAME = "toolforge";

export const MCP_SERVER_TITLE = "ToolForge";

/**
 * Bumped when the exposed tool set changes shape — a renamed tool, a removed
 * argument — so a client that caches a tool list can tell it has gone stale.
 * Independent of the site's own version: a release that only touches CSS does
 * not move this.
 */
export const MCP_SERVER_VERSION = "1.0.0";

/** Prefix on every tool name. See `tool-name.ts` for why it is not optional. */
export const MCP_TOOL_PREFIX = "toolforge";

/**
 * Where the endpoint answers. Named once because four places have to agree:
 * the route file's location, the guide page, the README, and every snippet the
 * guide page hands somebody to paste into a client.
 */
export const MCP_ENDPOINT_PATH = "/api/mcp";

/**
 * Ceiling on one JSON-RPC message.
 *
 * Well under `serverActions.bodySizeLimit`, because nothing exposed here takes
 * a file. The largest legitimate call is a document conversion — a megabyte of
 * JSON, the same ceiling the Base64 and URL tools hold — plus room for the
 * envelope around it.
 */
export const MAX_MCP_BODY_BYTES = 2 * 1_048_576;

/**
 * Longest free-text argument any tool accepts.
 *
 * Individual tools tighten this — the Diff tool has its own line and byte
 * ceilings, the QR encoder's limit comes from the specification — but nothing
 * may exceed it, so a tool that forgets to set one still cannot be handed a
 * novel. The number matches `MAX_BASE64_INPUT_BYTES`, which is the largest
 * input any exposed tool was designed for.
 */
export const MAX_MCP_TEXT_LENGTH = 1_048_576;

/**
 * Ceiling on a repeated argument — a list of colours, a batch of timestamps.
 * Chosen to match `MAX_UUID_QUANTITY`, the largest batch any tool offers.
 */
export const MAX_MCP_LIST_LENGTH = 500;

/**
 * Environment variable holding the bearer token for `network` tools.
 *
 * Named once here because three places have to agree on it: the gate, the
 * documentation table, and `example.env`.
 */
export const MCP_TOKEN_ENV = "MCP_ACCESS_TOKEN";
