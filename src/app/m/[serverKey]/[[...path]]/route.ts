import { handleMockRequest } from "@/modules/mock-server/repository/handle";

/**
 * Where a mock endpoint answers, for the seven methods a route file may export.
 *
 * All the reasoning — the security headers, the gate ordering, the rate limit,
 * the logging — lives in `handleMockRequest`. It moved there when `QUERY`
 * arrived: Next.js route handlers support `GET, POST, PUT, PATCH, DELETE, HEAD`
 * and `OPTIONS` and answer **405 to anything else, before any code here runs**,
 * so an RFC 10008 request can only be served from `src/proxy.ts`, which sees
 * the request earlier. Two entry points, one handler — the alternative was two
 * copies of a pipeline that ends in somebody else's public API.
 *
 * This file is now seven lines of plumbing on purpose.
 */

/** Every request must reach the database, or a just-saved endpoint serves stale. */
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ serverKey: string; path?: string[] }>;
};

async function handle(request: Request, context: RouteContext): Promise<Response> {
    const { serverKey, path } = await context.params;

    return handleMockRequest(request, { serverKey, path: `/${(path ?? []).join("/")}` });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}
