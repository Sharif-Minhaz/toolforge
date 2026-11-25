import { getOfflineTools } from "@/modules/tools/domain/tool-catalog";
import type { Tool } from "@/modules/tools/types";

/**
 * What the service worker keeps so the installed app works with no connection.
 *
 * The list is written at build time by `scripts/build-sw-manifest.ts`, because
 * only the build knows the hashed name of every chunk — including the ones a
 * tool pulls in lazily with `import()`, which no page's HTML mentions. Caching
 * only what a reader happened to visit leaves a tool that opens offline and
 * then cannot load its own encoder.
 */

/** The page a navigation falls back to when it is offline and not kept. */
export const OFFLINE_PATH = "/offline";

export const SERVICE_WORKER_PATH = "/sw.js";

/** Generated after `next build`; `public/sw.js` imports it. Gitignored. */
export const SERVICE_WORKER_MANIFEST_FILE = "sw-manifest.js";

/** Files outside `.next/static` the offline tools fetch at runtime. */
export const PUBLIC_PRECACHE = [
    "/manifest.webmanifest",
    "/icon-192.png",
    "/icon-512.png",
    "/brand-mark.webp",
    // The PDF converter embeds these into the documents it writes.
    "/fonts/NotoSansBengali-Regular.ttf",
    "/fonts/NotoSansBengali-Bold.ttf",
    "/fonts/RobotoMono-Regular.ttf",
    "/fonts/RobotoMono-Bold.ttf",
] as const;

/**
 * Emitted by the build, never loaded by an offline tool:
 *
 * - source maps and the legacy font formats every browser that installs a PWA
 *   skips for the `woff2` beside them;
 * - ONNX Runtime's Node build and its WebAssembly. The model tools fetch their
 *   runtime from the same CDN as their weights, and the worker keeps both the
 *   first time they are used — precaching 24 MB of it for every installed app
 *   would charge readers who never open those tools.
 */
const SKIPPED_ASSET = /\.(?:map|ttf|woff)$|\/ort\.node\.|\/ort-wasm[^/]*\.wasm$/;

export function isPrecachedAsset(path: string): boolean {
    return !SKIPPED_ASSET.test(path);
}

/** Pages the installed app keeps: the overview, the fallback, and every offline tool. */
export function offlinePagePaths(tools: readonly Tool[] = getOfflineTools()): string[] {
    return ["/", OFFLINE_PATH, ...tools.map((tool) => tool.href)];
}

export type PrecacheManifest = {
    /** The build id; a new one makes the browser install a new worker. */
    readonly version: string;
    /** Same-origin URLs whose bytes never change under that URL. */
    readonly assets: readonly string[];
    /** Page URLs, re-fetched on every warm because their HTML follows the locale. */
    readonly pages: readonly string[];
};

export function buildPrecacheManifest(
    version: string,
    staticFiles: readonly string[],
): PrecacheManifest {
    return {
        version,
        assets: [
            ...staticFiles.filter(isPrecachedAsset).map((file) => `/_next/static/${file}`),
            ...PUBLIC_PRECACHE,
        ],
        pages: offlinePagePaths(),
    };
}

/** The script `public/sw.js` runs through `importScripts`. */
export function serializePrecacheManifest(manifest: PrecacheManifest): string {
    return `self.__PRECACHE = ${JSON.stringify(manifest)};\n`;
}
