import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

import { SITE_NAME } from "@/modules/seo/domain/site";

/**
 * Reads the locale cookie like the rest of the app, so an installed shortcut
 * carries the language the visitor chose rather than the build-time default.
 *
 * `description` and `screenshots` are what turn Chrome's bare install prompt
 * into the richer dialog with a "From the app" blurb and a carousel. Chrome
 * wants one aspect ratio per `form_factor`: `wide` on desktop, `narrow` on
 * phones. The images are real captures of the site, dark theme.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const [tApp, tMeta, tShots] = await Promise.all([
        getTranslations("app"),
        getTranslations("overview.meta"),
        getTranslations("pwa.screenshots"),
    ]);

    return {
        id: "/",
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
        screenshots: [
            {
                src: "/screenshots/home-wide.png",
                sizes: "1280x720",
                type: "image/png",
                form_factor: "wide",
                label: tShots("home"),
            },
            {
                src: "/screenshots/tool-wide.png",
                sizes: "1280x720",
                type: "image/png",
                form_factor: "wide",
                label: tShots("tool"),
            },
            {
                src: "/screenshots/home-narrow.png",
                sizes: "540x960",
                type: "image/png",
                form_factor: "narrow",
                label: tShots("home"),
            },
            {
                src: "/screenshots/tool-narrow.png",
                sizes: "540x960",
                type: "image/png",
                form_factor: "narrow",
                label: tShots("tool"),
            },
        ],
    };
}
