import { RASTER_FORMAT_MIME_TYPES } from "./image-codec";

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
 * - the two `maskable-icon-*.png` sizes are optional, and only a tool that drew
 *   its glyph inside the safe zone may add them (see `buildWebManifest`).
 */

export const FAVICON_ICO_NAME = "favicon.ico";

export const FAVICON_MANIFEST_NAME = "site.webmanifest";

export const FAVICON_SNIPPET_NAME = "head.html";

export const ICO_MIME_TYPE = "image/vnd.microsoft.icon";

const MANIFEST_MIME_TYPE = "application/manifest+json";

const HTML_MIME_TYPE = "text/html";

export const FAVICON_ICO_SIZES = [16, 32, 48] as const;

export const FAVICON_APPLE_TOUCH_NAME = "apple-touch-icon.png";

export type FaviconPngSpec = {
    readonly name: string;
    readonly size: number;
};

export const FAVICON_PNGS: readonly FaviconPngSpec[] = [
    { name: "favicon-96x96.png", size: 96 },
    { name: FAVICON_APPLE_TOUCH_NAME, size: 180 },
    { name: "web-app-manifest-192x192.png", size: 192 },
    { name: "web-app-manifest-512x512.png", size: 512 },
];

export const FAVICON_MASKABLE_PNGS: readonly FaviconPngSpec[] = [
    { name: "maskable-icon-192x192.png", size: 192 },
    { name: "maskable-icon-512x512.png", size: 512 },
];

/** What only a caller that drew the icons itself knows. Every field is optional. */
export type WebManifestExtras = {
    /** `#rrggbb`. */
    readonly themeColor?: string;
    /** `#rrggbb`. */
    readonly backgroundColor?: string;
    /** Lists `FAVICON_MASKABLE_PNGS` as `purpose: "maskable"`. */
    readonly maskable?: boolean;
};

/**
 * A manifest with only the fields the caller can honestly fill in.
 *
 * `name` and `short_name` are the caller's: the image converter passes the
 * source filename, because the only other options are to invent a site name or
 * to add a text field for one, and the filename is at least the reader's own
 * word.
 *
 * The `web-app-manifest-*` icons are `any`, never `maskable`. A maskable icon
 * has to keep its content inside a safe zone that a launcher may crop to a
 * circle; a picture scaled to fill the square would get its edges cut off on
 * Android and nowhere else. Only a caller that drew its own glyph inside that
 * zone passes `maskable`, which adds the separate maskable pair.
 *
 * `theme_color` and `background_color` are absent unless passed, for the same
 * reason: a tool that does not know the site's colours must not guess, because
 * a guessed `#ffffff` is a wrong answer that looks like a considered one. With
 * no extras the output is byte-for-byte what it was before they existed —
 * `JSON.stringify` drops an `undefined` field.
 */
export function buildWebManifest(name: string, extras: WebManifestExtras = {}): string {
    const icon = (purpose: "any" | "maskable") => (png: FaviconPngSpec) => ({
        src: `/${png.name}`,
        sizes: `${png.size}x${png.size}`,
        type: "image/png",
        purpose,
    });

    return `${JSON.stringify(
        {
            name,
            short_name: name,
            icons: [
                ...FAVICON_PNGS.filter((png) => png.name.startsWith("web-app-manifest")).map(
                    icon("any"),
                ),
                ...(extras.maskable === true ? FAVICON_MASKABLE_PNGS.map(icon("maskable")) : []),
            ],
            display: "standalone",
            theme_color: extras.themeColor,
            background_color: extras.backgroundColor,
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

/** One PNG member of a pack, already encoded. */
export type FaviconPng = {
    readonly name: string;
    readonly png: ArrayBuffer;
};

export type FaviconPackFile = {
    readonly name: string;
    readonly bytes: number;
    readonly blob: Blob;
};

/**
 * The pack's members, in the order a reader sees them listed: the ico, the
 * PNGs as given, then the manifest and the `<head>` snippet.
 *
 * Shared so every tool that writes a pack writes the same set under the same
 * names and types — the snippet links those exact names, so a second copy of
 * this list is a pack that links a file it does not ship.
 */
export function assembleFaviconPack(
    ico: Uint8Array<ArrayBuffer>,
    pngs: readonly FaviconPng[],
    manifest: string,
): FaviconPackFile[] {
    return [
        { name: FAVICON_ICO_NAME, blob: new Blob([ico], { type: ICO_MIME_TYPE }) },
        ...pngs.map((entry) => ({
            name: entry.name,
            blob: new Blob([entry.png], { type: RASTER_FORMAT_MIME_TYPES.png }),
        })),
        {
            name: FAVICON_MANIFEST_NAME,
            blob: new Blob([manifest], { type: MANIFEST_MIME_TYPE }),
        },
        {
            name: FAVICON_SNIPPET_NAME,
            blob: new Blob([buildFaviconHeadHtml()], { type: HTML_MIME_TYPE }),
        },
    ].map((entry) => ({ ...entry, bytes: entry.blob.size }));
}
