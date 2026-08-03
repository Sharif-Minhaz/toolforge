import type { IconSize } from "../types";

/**
 * The favicon pack.
 *
 * One source picture in, the set a modern site actually links to out. The
 * contents are not a matter of taste — each entry exists because some specific
 * client asks for it:
 *
 * - `favicon.ico` at 16/32/48 is what a browser requests from the site root
 *   whether or not anything links to it, and what Windows reads for a pinned
 *   shortcut.
 * - `favicon-96x96.png` covers the high-DPI tab.
 * - `apple-touch-icon.png` at 180 is what iOS puts on the home screen.
 * - the two `web-app-manifest-*.png` sizes are the pair the web app manifest
 *   spec's own examples use, and the pair install prompts look for.
 */

export const FAVICON_ICO_NAME = "favicon.ico";

export const FAVICON_MANIFEST_NAME = "site.webmanifest";

export const FAVICON_SNIPPET_NAME = "head.html";

export const FAVICON_ICO_SIZES: readonly IconSize[] = [16, 32, 48];

export type FaviconPngSpec = {
    readonly name: string;
    readonly size: number;
};

export const FAVICON_PNGS: readonly FaviconPngSpec[] = [
    { name: "favicon-96x96.png", size: 96 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "web-app-manifest-192x192.png", size: 192 },
    { name: "web-app-manifest-512x512.png", size: 512 },
];

/**
 * A manifest with only the fields this tool can honestly fill in.
 *
 * `name` and `short_name` come from the source filename, because the only other
 * options are to invent a site name or to add a text field for one, and the
 * filename is at least the reader's own word. The article says to edit them.
 *
 * `purpose` is deliberately `any` rather than `maskable`. A maskable icon has
 * to keep its content inside a safe zone that a launcher may crop to a circle;
 * these are scaled to fill the square, so declaring them maskable would get the
 * edges of somebody's logo cut off on Android and nowhere else.
 *
 * `theme_color` and `background_color` are absent for the same reason: this
 * tool does not know the site's colours, and a guessed `#ffffff` is a wrong
 * answer that looks like a considered one.
 */
export function buildWebManifest(name: string): string {
    return `${JSON.stringify(
        {
            name,
            short_name: name,
            icons: FAVICON_PNGS.filter((png) => png.name.startsWith("web-app-manifest")).map(
                (png) => ({
                    src: `/${png.name}`,
                    sizes: `${png.size}x${png.size}`,
                    type: "image/png",
                    purpose: "any",
                }),
            ),
            display: "standalone",
        },
        null,
        2,
    )}\n`;
}

/**
 * The tags that make the pack take effect, assuming the files sit at the site
 * root.
 *
 * `shortcut icon` is the odd one and it stays: it is a single relation name
 * that older Windows and a few feed readers still look for, and dropping it
 * costs nothing to keep.
 */
export function buildFaviconHeadHtml(): string {
    return [
        '<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />',
        '<link rel="shortcut icon" href="/favicon.ico" />',
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
        '<link rel="manifest" href="/site.webmanifest" />',
        "",
    ].join("\n");
}
