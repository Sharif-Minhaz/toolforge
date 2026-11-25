import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * `rewriteTo` is the internal `app/[locale]` path the proxy resolved; every
 * response this builds keeps it, so refreshing the session never undoes it.
 */
export const updateSession = async (request: NextRequest, rewriteTo?: URL) => {
    const forward = () =>
        rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request });
    let supabaseResponse = forward();

    const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = forward();
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options),
                );
            },
        },
    });

    // Refreshes the auth token and writes it back onto supabaseResponse via setAll.
    // Do not remove: without this call the proxy returns an untouched response and
    // sessions expire silently.
    //
    // `getClaims` rather than `getUser`: it verifies the JWT locally against the
    // project's published signing keys instead of a round trip to Supabase Auth
    // on every navigation, and still refreshes a session that is about to
    // expire. With a legacy HS256 secret it falls back to the server check. The
    // proxy only refreshes here — nothing downstream trusts this call.
    await supabase.auth.getClaims();

    return supabaseResponse;
};
