import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/modules/seo/domain/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // The token in a dynamic QR edit URL is a credential. The page sets
            // `noindex` of its own, and this keeps a crawler from requesting it
            // at all — the path prefix is public knowledge, the token is not.
            disallow: "/tools/qr/edit/",
        },
        sitemap: absoluteUrl("/sitemap.xml"),
        host: absoluteUrl("/"),
    };
}
