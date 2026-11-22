import { SITE_URL } from "@/modules/seo/domain/site";
import { SHORTENER_SERVICE, UNLOCK_PREFIX } from "@/modules/short-links/domain/constants";
import { redirectResponse } from "@/modules/short-links/domain/redirect";
import { countVisit } from "@/modules/short-links/repository/links";
import { resolveShortLink } from "@/modules/short-links/repository/resolve";
import { isServiceHost } from "@/modules/tools/domain/service-hosts";

/**
 * Where a shortened link actually lands.
 *
 * A Route Handler rather than a page, for the same reason its twin at
 * `/q/[slug]` is one: there is no UI to render, and what the client needs is a
 * real HTTP redirect carrying headers a page cannot set. Both resolve the same
 * table through the same `resolveShortLink`, so a window or a password behaves
 * identically whichever address was shared.
 */

const TOOL_PATH = "/tools/shortener";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
    const { slug } = await params;
    const decision = await resolveShortLink(slug);
    // On the short-link subdomain every path is a slug, so this site's own
    // pages have to be named on the main origin or the hop would loop back.
    const site = isServiceHost(request.headers.get("host"), SHORTENER_SERVICE) ? SITE_URL : "";

    switch (decision.kind) {
        case "redirect":
            // Counted only once the destination is actually handed over, so a
            // gated link does not score a visit for arriving at its own gate.
            await countVisit(slug);

            return redirectResponse(decision.target, 302);
        case "password":
            return redirectResponse(`${site}${UNLOCK_PREFIX}/${slug}`, 307);
        default:
            // `pending` and `expired` are carried to a page rather than
            // explained here — a redirect has nowhere to put words.
            return redirectResponse(`${site}${TOOL_PATH}?state=${decision.kind}`, 307);
    }
}
