import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { logEvent } from "@/modules/observability/domain/logger";
import type { JsonValue } from "@/modules/tools/types/json-document";

import { decideMcpAccess } from "../domain/access";
import { MCP_TOKEN_ENV } from "../domain/constants";
import { buildMcpIdentity } from "../domain/identity";
import type { McpTool, McpToolOutcome } from "../types";
import { MCP_TOOLS } from "../tools";

/**
 * The registry, handed to the SDK.
 *
 * Everything above this file is ours and framework-free; everything below it is
 * the protocol's. The seam is deliberate and it is what keeps the whole tool
 * set testable without a transport — `MCP_TOOLS` can be called directly, and
 * this file is the only place that knows what a content block is.
 *
 * A fresh server per request, which is what stateless Streamable HTTP means:
 * no session to keep, nothing held between calls, and therefore nothing for a
 * serverless instance to lose when it is recycled. Registering twenty-eight
 * tools is building twenty-eight closures over schemas that already exist, so
 * the cost is not worth a cache that would have to be invalidated.
 *
 * **No `server-only` marker here, unlike its neighbours in this directory, and
 * that is deliberate rather than an oversight.** This file opens no connection,
 * reads no secret store and holds no database client; the one environment read
 * is a non-public variable, which a client bundle would see as `undefined`
 * rather than leak. What it does do is decide the exact bytes another program
 * receives — and `tests/protocol.test.ts` checks those bytes by driving it with
 * the SDK's own client, which it could not import if this module refused to
 * load outside a server runtime. The marker stays on `handle.ts` and
 * `rate-limit.ts`, which genuinely do touch the request and the database.
 */

/**
 * Our outcome, as the protocol says it.
 *
 * Both halves of the result are filled in on purpose. `content` is what a model
 * reads and what an older client shows; `structuredContent` is the same answer
 * as data for a client that can use it. Sending only the second would leave the
 * first blank in transcripts, which is how a working tool comes to look broken.
 *
 * A refusal sets `isError`, so a client renders it as a failed call rather than
 * as an answer that happens to contain the word "refused".
 */
function toCallToolResult(outcome: McpToolOutcome): CallToolResult {
    const data = outcome.ok ? outcome.data : (outcome.data ?? { reason: outcome.reason });

    return {
        content: [{ type: "text", text: outcome.summary }],
        structuredContent: { summary: outcome.summary, ...asRecord(data) },
        ...(outcome.ok ? {} : { isError: true }),
    };
}

/** `structuredContent` must be an object; a bare array or string is wrapped. */
function asRecord(data: JsonValue): Record<string, JsonValue> {
    return typeof data === "object" && data !== null && !Array.isArray(data)
        ? data
        : { value: data };
}

/**
 * The token gate, applied per tool rather than per request.
 *
 * Per request would mean either locking the whole endpoint behind a secret —
 * which would cost every offline tool its reason for being open — or leaving
 * the networked one open. Per tool is the only arrangement where "encode this
 * base64" needs nothing and "inspect this domain" needs the token.
 *
 * Read from the environment on every call rather than captured at module load,
 * so a deployment that sets the variable does not need a restart to mean it.
 */
function checkAccess(tool: McpTool, token: string | null): McpToolOutcome | null {
    const decision = decideMcpAccess(tool.kind, token, process.env[MCP_TOKEN_ENV] ?? "");

    if (decision.allowed) {
        return null;
    }

    return {
        ok: false,
        reason: decision.reason,
        summary:
            decision.reason === "token_missing"
                ? `${tool.name} makes outbound requests and this deployment has no ${MCP_TOKEN_ENV} configured, so it is refused.`
                : `${tool.name} makes outbound requests and requires a bearer token in the Authorization header.`,
        data: { reason: decision.reason, tool: tool.name },
    };
}

export function buildMcpServer(bearerToken: string | null): McpServer {
    const server = new McpServer(buildMcpIdentity(), {
        capabilities: { tools: {} },
        instructions:
            "ToolForge exposes developer utilities that run on the server: encoding, hashing, encryption, JWTs, formatting, text comparison and domain lookups. Call toolforge_catalog_list to see every tool the site offers, including the image tools that only run in a browser tab and are therefore not callable here.",
    });

    for (const tool of MCP_TOOLS) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema.shape,
                annotations: {
                    title: tool.title,
                    readOnlyHint: tool.readOnly,
                    // Nothing here can delete or overwrite anything: the tools
                    // either compute or read. Saying so lets a client skip a
                    // confirmation prompt it would otherwise be right to show.
                    destructiveHint: false,
                    openWorldHint: tool.kind === "network",
                },
            },
            async (rawArguments: unknown): Promise<CallToolResult> => {
                const refusal = checkAccess(tool, bearerToken);

                if (refusal !== null) {
                    return toCallToolResult(refusal);
                }

                const outcome = await tool.run(rawArguments);

                // `defineMcpTool` turns a thrown error into this reason and
                // cannot log it — `domain/` has nowhere to write. Here it can.
                if (!outcome.ok && outcome.reason === "internal_error") {
                    logEvent("error", "mcp.tool_failed", { tool: tool.name });
                }

                return toCallToolResult(outcome);
            },
        );
    }

    return server;
}
