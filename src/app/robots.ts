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
            ],
        },
        sitemap: absoluteUrl("/sitemap.xml"),
        host: absoluteUrl("/"),
    };
}
