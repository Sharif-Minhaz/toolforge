import { isValidSlug, parseTargetUrl } from "@/modules/qr/domain/short-code";
import { resolveScan } from "@/modules/qr/repository/qr-links";

/**
 * Where a printed dynamic code actually lands.
 *
 * A Route Handler rather than a page, and the one place in this repository where
 * that is the right call: the client is a phone's camera app following a link,
 * there is no UI to render, and what it needs is a real HTTP redirect carrying
 * headers a page cannot set. `resolveScan` counts the scan in the same statement
 * that reads the destination.
 */

/** Every scan has to reach the database, or a re-pointed code keeps its old target. */
export const dynamic = "force-dynamic";

const NOT_FOUND_PATH = "/tools/qr?code=missing";

function redirect(location: string, status: 302 | 307): Response {
    return new Response(null, {
        status,
        headers: {
            Location: location,
            // A short link is a pointer, not content. Caching it anywhere would
            // outlive the next time its owner re-points it.
            "Cache-Control": "no-store, max-age=0",
            // The destination belongs to whoever created the code, so this
            // origin lends it none of its own search ranking.
            "X-Robots-Tag": "noindex, nofollow",
            // The destination has no business knowing which slug sent the visitor.
            "Referrer-Policy": "no-referrer",
        },
    });
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
    const { slug } = await params;

    // Checked before the query, so a scan of a mangled code — or a scripted walk
    // of the keyspace — never reaches the database.
    if (!isValidSlug(slug)) {
        return redirect(NOT_FOUND_PATH, 307);
    }

    const target = await resolveScan(slug);

    if (target === null) {
        return redirect(NOT_FOUND_PATH, 307);
    }

    // Re-checked on the way out as well as on the way in. The stored value was
    // validated when the code was created, but this is the line that becomes a
    // `Location` header, and a header is not the place to assume anything.
    const parsed = parseTargetUrl(target);

    if (!parsed.ok) {
        return redirect(NOT_FOUND_PATH, 307);
    }

    // 302 rather than 301: the whole point of a dynamic code is that this
    // destination changes, and a permanent redirect is cached indefinitely by
    // every browser that has already followed it once.
    return redirect(parsed.url, 302);
}
