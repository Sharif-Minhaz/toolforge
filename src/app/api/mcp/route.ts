import { handleMcpRequest } from "@/modules/mcp/repository/handle";

/**
 * The MCP endpoint, for the four methods the Streamable HTTP transport speaks.
 *
 * All the reasoning — the security headers, the gate ordering, the rate limit,
 * the token, the logging — lives in `handleMcpRequest`, so this file is
 * plumbing on purpose. The same split the JSON Server Studio's route uses.
 */

/** Every call is metered and most mint fresh randomness. Nothing here caches. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
    return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
    return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
    return handleMcpRequest(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
    return handleMcpRequest(request);
}
