import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { MOCK_EXECUTION_PREFIX } from "@/modules/mock-server/domain/constants";

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
        return NextResponse.next();
    }

    return await updateSession(request);
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
