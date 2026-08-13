import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/modules/seo/domain/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: [
                // The token in an edit URL is a credential. Both pages set
                // `noindex` of their own, and this keeps a crawler from
                // requesting one at all — the path prefix is public knowledge,
                // the token is not.
                "/tools/qr/edit/",
                "/tools/shortener/edit/",
                // Short links are pointers to somebody else's page, and the
                // gate in front of a protected one is not content. The redirect
                // routes already answer with `X-Robots-Tag: noindex`; this
                // saves the crawl entirely.
                "/q/",
                "/s/",
                "/unlock/",
                // Mock endpoints answer with data somebody is developing
                // against, not with content this site publishes. Every response
                // already carries `X-Robots-Tag: noindex`; this stops the
                // request being made at all, which matters more here than
                // elsewhere because a crawl of a mock server is a crawl of
                // somebody's whole API surface.
                "/m/",
                // A workspace id is a handle to somebody's work. Owning it
                // still needs the cookie, but an indexed URL is an invitation
                // to try the door.
                "/mock/",
                // A JSON-RPC endpoint is not content, and every request to it
                // spends a rate-limit counter. The guide at `/mcp` is what
                // should be found; the address it documents is not. The handler
                // sets `X-Robots-Tag: noindex` too — this saves the request.
                "/api/",
            ],
        },
        sitemap: absoluteUrl("/sitemap.xml"),
        host: absoluteUrl("/"),
    };
}
