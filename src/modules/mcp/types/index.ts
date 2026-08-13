import type { z } from "zod";

import type { JsonValue } from "@/modules/tools/types/json-document";
import type { ToolId } from "@/modules/tools/types";

/**
 * What an MCP client is allowed to do with ToolForge, expressed in this
 * repository's own vocabulary rather than the protocol's.
 *
 * The protocol shapes — JSON-RPC envelopes, content blocks, capability
 * negotiation — belong to `@modelcontextprotocol/sdk` and are never restated
 * here. What is ours is the answer to two questions the SDK does not ask: which
 * ToolForge tool an MCP tool speaks for, and whether calling it costs this
 * deployment anything a stranger could spend.
 */

/**
 * Whether a call leaves this process.
 *
 * `offline` is arithmetic on the caller's own argument: a UUID, a digest, a
 * parsed cron expression. It costs CPU and nothing else, so it is open to
 * anyone the rate limiter has not refused.
 *
 * `network` reaches somebody else's host, or writes a row. That is a resource a
 * stranger's model could spend on this deployment's behalf, so it is gated on a
 * bearer token and refused outright when no token is configured.
 */
export const MCP_TOOL_KINDS = ["offline", "network"] as const;

export type McpToolKind = (typeof MCP_TOOL_KINDS)[number];

/**
 * One answer, before it becomes protocol.
 *
 * Deliberately not the SDK's `CallToolResult`: a handler returns what happened,
 * and `repository/server.ts` decides how that reads as content blocks. Keeping
 * the two apart is what lets the whole registry be unit-tested without a
 * transport.
 *
 * `summary` is the line a model reads first, so it states the outcome rather
 * than describing it — "3 UUIDs (v7)", not "generation complete". `data` is the
 * machine-readable body, mirrored into `structuredContent`.
 */
export type McpToolSuccess = {
    readonly ok: true;
    readonly summary: string;
    readonly data: JsonValue;
};

/**
 * A refusal the caller caused, carrying the domain layer's own name for it.
 *
 * `reason` is passed through verbatim from whichever failure union the domain
 * returned — `invalid_quantity`, `too_long`, `unsupported_algorithm` — so a
 * model asking twice gets the same word twice and can act on it. A thrown error
 * is a different thing entirely and never arrives here.
 */
export type McpToolRefusal = {
    readonly ok: false;
    readonly reason: string;
    readonly summary: string;
    readonly data?: JsonValue;
};

export type McpToolOutcome = McpToolSuccess | McpToolRefusal;

/**
 * Which entry of the catalogue an MCP tool speaks for.
 *
 * Almost always a real tool. `"catalog"` is the one exception: the tool that
 * lists the toolbox is about the toolbox rather than about any tool in it, and
 * borrowing some unrelated tool's id to name it would make
 * `toolforge_uuid_catalog`, which is a lie about where it lives.
 */
export type McpToolOwner = ToolId | "catalog";

/** The argument schema of an MCP tool: always an object, because MCP says so. */
export type McpInputSchema = z.ZodObject<z.ZodRawShape>;

/**
 * A registered tool, with its argument type erased.
 *
 * `run` takes `unknown` because the registry holds tools of many different
 * argument shapes in one array. The type is recovered inside `defineMcpTool`,
 * which parses with the same schema the client was handed before calling a
 * handler that is fully typed.
 */
export type McpTool = {
    readonly name: string;
    readonly title: string;
    readonly description: string;
    readonly kind: McpToolKind;
    readonly toolId: McpToolOwner;
    /** True when the call cannot change anything a later call would observe. */
    readonly readOnly: boolean;
    readonly inputSchema: McpInputSchema;
    readonly run: (rawArguments: unknown) => Promise<McpToolOutcome>;
};

/** Why a call was refused before any handler ran. */
export const MCP_ACCESS_REFUSALS = ["token_required", "token_invalid", "token_missing"] as const;

export type McpAccessRefusal = (typeof MCP_ACCESS_REFUSALS)[number];

export type McpAccessDecision =
    { readonly allowed: true } | { readonly allowed: false; readonly reason: McpAccessRefusal };
