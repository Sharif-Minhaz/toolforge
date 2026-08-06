import { handleJsonRequest } from "@/modules/json-server/repository/handle";

/**
 * Where a JSON server answers, for the seven methods a route file may export.
 *
 * All the reasoning — the security headers, the gate ordering, the rate limit,
 * the logging — lives in `handleJsonRequest`, so this file is plumbing on
 * purpose. Next.js route handlers support `GET, POST, PUT, PATCH, DELETE, HEAD`
 * and `OPTIONS` and answer 405 to anything else before any code here runs, which
 * is exactly the set `json-server` itself speaks.
 */

/** Every request must reach the database, or a just-written record serves stale. */
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ serverKey: string; path?: string[] }>;
};

async function handle(request: Request, context: RouteContext): Promise<Response> {
    const { serverKey, path } = await context.params;

    return handleJsonRequest(request, { serverKey, path: `/${(path ?? []).join("/")}` });
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
