import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

import { SITE_NAME } from "@/modules/seo/domain/site";

/**
 * Reads the locale cookie like the rest of the app, so an installed shortcut
 * carries the language the visitor chose rather than the build-time default.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const [tApp, tMeta] = await Promise.all([
        getTranslations("app"),
        getTranslations("overview.meta"),
    ]);

    return {
        name: `${SITE_NAME} — ${tApp("tagline")}`,
        short_name: SITE_NAME,
        description: tMeta("description"),
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        // Matches the dark theme surface, which is what an installed shell opens on.
        background_color: "#0c0d10",
        theme_color: "#0c0d10",
        categories: ["developer", "productivity", "utilities"],
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
    };
}
