import type { HighlightLanguage } from "@/modules/tools/domain/highlight";

import { MCP_SERVER_NAME, MCP_TOKEN_ENV } from "./constants";

/**
 * How each client is pointed at this endpoint.
 *
 * Data rather than copy, and therefore here rather than in the message
 * catalogue — for the reason the QR tool's sample payloads are: a translator
 * handed `claude mcp add --transport http` will eventually translate one of
 * those words, and the result is a command that does not run. The label above
 * each block is a message key; the block itself is not.
 *
 * The address is substituted at render time rather than baked in, because it
 * depends on the deployment and the page has to be honest about which one the
 * reader is looking at.
 */

export const MCP_CLIENT_IDS = ["claudeCode", "claudeDesktop", "chatgpt", "cursor"] as const;

export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export type McpClientRecipe = {
    readonly id: McpClientId;
    readonly language: HighlightLanguage;
    /** With no token — every offline tool works like this. */
    readonly snippet: (url: string) => string;
    /**
     * With the bearer token, for the tools that make outbound requests.
     * `null` where the client's own interface asks for the header rather than
     * taking it from a file, which is the case worth saying out loud instead of
     * showing a config block nobody can paste anywhere.
     */
    readonly withToken: ((url: string) => string) | null;
};

export const MCP_CLIENT_RECIPES: readonly McpClientRecipe[] = [
    {
        id: "claudeCode",
        language: "shell",
        snippet: (url) => `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`,
        withToken: (url) =>
            `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
        id: "claudeDesktop",
        language: "json",
        snippet: (url) =>
            `{
  "mcpServers": {
    "${MCP_SERVER_NAME}": {
      "type": "http",
      "url": "${url}"
    }
  }
}`,
        withToken: (url) =>
            `{
  "mcpServers": {
    "${MCP_SERVER_NAME}": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`,
    },
    {
        id: "chatgpt",
        language: "plain",
        snippet: (url) => url,
        withToken: null,
    },
    {
        id: "cursor",
        language: "json",
        snippet: (url) =>
            `{
  "mcpServers": {
    "${MCP_SERVER_NAME}": {
      "url": "${url}"
    }
  }
}`,
        withToken: (url) =>
            `{
  "mcpServers": {
    "${MCP_SERVER_NAME}": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`,
    },
];

/**
 * One request, for somebody who would rather see the protocol than a config
 * file.
 *
 * `initialize` rather than `tools/list`, because it is the only method a server
 * will answer as a first message — an MCP session is a handshake, and a probe
 * that skips it would fail for a reason that has nothing to do with whether the
 * endpoint is up.
 */
export function buildProbeCommand(url: string): string {
    return `curl -sS ${url} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18",
        "capabilities":{},
        "clientInfo":{"name":"curl","version":"1.0.0"}}}'`;
}

/** How a deployment mints the token the networked tools ask for. */
export function buildTokenCommand(): string {
    return `# 32 random bytes, base64url — long enough that guessing is not a strategy
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='

# then, in the deployment's environment
${MCP_TOKEN_ENV}=<the value you just generated>`;
}
