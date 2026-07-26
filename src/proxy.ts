import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed `middleware` to `proxy`. The exported function name matters —
// Next looks for a `proxy` or default export here.
export async function proxy(request: NextRequest) {
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Everything except static assets, so the auth token refreshes on real
        // navigations without burning a proxy invocation on every image.
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
    ],
};
