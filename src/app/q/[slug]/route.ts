import { UNLOCK_PREFIX } from "@/modules/short-links/domain/constants";
import { redirectResponse } from "@/modules/short-links/domain/redirect";
import { countVisit } from "@/modules/short-links/repository/links";
import { resolveShortLink } from "@/modules/short-links/repository/resolve";

/**
 * Where a printed dynamic code actually lands.
 *
 * A Route Handler rather than a page, and one of only two in this repository
 * where that is the right call: the client is a phone's camera app following a
 * link, there is no UI to render, and what it needs is a real HTTP redirect
 * carrying headers a page cannot set. Its twin at `/s/[slug]` resolves the same
 * table through the same `resolveShortLink`.
 */

/** Every visit has to reach the database, or a re-pointed link keeps its old target. */
export const dynamic = "force-dynamic";

const TOOL_PATH = "/tools/qr";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
    const { slug } = await params;
    const decision = await resolveShortLink(slug);

    switch (decision.kind) {
        case "redirect":
            // Counted only once the destination is actually handed over, so a
            // gated link does not score a visit for arriving at its own gate.
            await countVisit(slug);

            return redirectResponse(decision.target, 302);
        case "password":
            return redirectResponse(`${UNLOCK_PREFIX}/${slug}`, 307);
        default:
            // `pending` and `expired` are carried to a page rather than
            // explained here — a redirect has nowhere to put words.
            return redirectResponse(`${TOOL_PATH}?state=${decision.kind}`, 307);
    }
}
