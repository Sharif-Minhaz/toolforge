import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { MOCK_EXECUTION_PREFIX } from "@/modules/mock-server/domain/constants";
import { parseMockPath } from "@/modules/mock-server/domain/path-pattern";

// Next 16 renamed `middleware` to `proxy`. The exported function name matters —
// Next looks for a `proxy` or default export here.
export async function proxy(request: NextRequest) {
    // Mock endpoints are somebody else's program calling somebody else's API.
    // They must not pay for a Supabase session refresh, and they must not have
    // a `Set-Cookie` for this site's auth written onto a public API response —
    // which is exactly what `updateSession` would do, because the matcher below
    // catches every non-static path.
    //
    // Checked here rather than in `config.matcher` because matcher values have
    // to be build-time constants, and this prefix is a shared constant that
    // moves when execution eventually gets its own subdomain.
    if (isMockExecutionPath(request.nextUrl.pathname)) {
        return await serveMockHere(request);
    }

    return await updateSession(request);
}

/**
 * `QUERY` is served from here, and only `QUERY`.
 *
 * RFC 10008 defines a safe, idempotent, cacheable method that carries a request
 * body — and Next.js route handlers cannot export one. A `route.ts` may export
 * `GET, POST, PUT, PATCH, DELETE, HEAD` and `OPTIONS`; **anything else is
 * answered 405 by the framework before the file is consulted.** The proxy runs
 * earlier than that decision, defaults to the Node runtime, can read a body and
 * can return a response, so it is the one place a QUERY request is reachable at
 * all.
 *
 * Three things keep that from becoming a cost everybody pays:
 *
 * - **The import is dynamic and inside the branch.** `handleMockRequest` pulls
 *   in Prisma, the executor and the log writer. A static import here would put
 *   all of it in the proxy bundle, which runs on every navigation on this site —
 *   the same rule the image codecs follow, for the same reason.
 * - **Only `QUERY` takes this path.** Every other method still falls through to
 *   the route handler, so nothing about an ordinary request changes.
 * - **The handler is shared, not copied.** Two doors into one pipeline: the rate
 *   limit, the security headers and the log write cannot drift between them,
 *   because there is only one of each.
 */
async function serveMockHere(request: NextRequest): Promise<NextResponse | Response> {
    if (request.method.toUpperCase() !== "QUERY") {
        return NextResponse.next();
    }

    const target = parseMockPath(request.nextUrl.pathname, MOCK_EXECUTION_PREFIX);

    if (target === null) {
        return NextResponse.next();
    }

    const { handleMockRequest } = await import("@/modules/mock-server/repository/handle");

    return handleMockRequest(request, target);
}

function isMockExecutionPath(pathname: string): boolean {
    return pathname === MOCK_EXECUTION_PREFIX || pathname.startsWith(`${MOCK_EXECUTION_PREFIX}/`);
}

export const config = {
    matcher: [
        // Everything except static assets, so the auth token refreshes on real
        // navigations without burning a proxy invocation on every image.
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
    ],
};
