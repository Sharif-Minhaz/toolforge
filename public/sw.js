/*
 * ToolForge service worker — what lets the installed app run its browser tools
 * with no connection. The reasoning lives in docs/patterns/offline.md.
 *
 * - Pages: network first, so an online reader always gets the current deploy.
 *   Offline, an offline-capable tool answers from cache; anything else (a tool
 *   that needs the server) gets the /offline page.
 * - /_next/static: cache first. Every file there is content-hashed.
 * - Model weights and runtimes on a CDN: cache first, kept across deploys, so a
 *   model downloaded once while online still runs on a plane.
 *
 * Installed apps "warm": every chunk the build emitted plus every offline tool's
 * page, listed by sw-manifest.js (written after `next build`). A tool's lazy
 * `import()` chunks are not in any page's HTML, so caching only what was
 * visited would leave a tool that opens offline and cannot load its encoder.
 */

importScripts("/sw-manifest.js");

const { version, assets, pages } = self.__PRECACHE;

const PREFIX = "toolforge-";
const STATIC = `${PREFIX}static-${version}`;
const MODELS = `${PREFIX}models`;
const STATE = `${PREFIX}state`;
const WARMED_KEY = "/__toolforge-warmed";
const OFFLINE = "/offline";
const PAGES = new Set(pages);
const PUBLIC_ASSETS = new Set(assets.filter((url) => !url.startsWith("/_next/")));

// Where the model tools fetch weights and runtimes. Hugging Face is left out on
// purpose: the Image to 3D tool keeps its depth model in its own Cache API bucket.
const MODEL_HOSTS = new Set(["staticimgly.com", "cdn.jsdelivr.net"]);

// Enough parallel requests to finish a warm quickly without queueing hundreds.
const WARM_CONCURRENCY = 8;

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC);

            // The fallback page and the stylesheets it needs, for every visitor.
            await cache.addAll(
                [OFFLINE, ...assets.filter((url) => url.endsWith(".css"))].map(
                    (url) => new Request(url, { cache: "reload" }),
                ),
            );

            // An installed app that warmed the previous build stays whole across
            // the update instead of waiting for its next launch.
            const warmed = await readWarmed();

            if (warmed) {
                await warm(warmed.locale);
            }

            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();

            await Promise.all(
                keys
                    .filter((key) => key.startsWith(`${PREFIX}static-`) && key !== STATIC)
                    .map((key) => caches.delete(key)),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "warm" && typeof event.data.locale === "string") {
        event.waitUntil(warmOnce(event.data.locale));
    }
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        if (request.mode === "navigate") {
            event.respondWith(navigate(event, url));
        } else if (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.has(url.pathname)) {
            event.respondWith(cacheFirst(event, STATIC));
        }

        return;
    }

    if (MODEL_HOSTS.has(url.hostname)) {
        event.respondWith(cacheFirst(event, MODELS));
    }
});

// Writes go through `waitUntil` rather than being awaited: awaiting a `put`
// would hold the response until the whole body was read, which ends streaming.
async function navigate(event, url) {
    const kept = PAGES.has(url.pathname);

    try {
        const response = await fetch(event.request);

        // A redirected response cannot answer a later navigation, and a page
        // that needs the server is never served from cache.
        if (kept && response.ok && !response.redirected) {
            const copy = response.clone();

            event.waitUntil(caches.open(STATIC).then((cache) => cache.put(url.pathname, copy)));
        }

        return response;
    } catch {
        const cache = await caches.open(STATIC);
        const hit = kept ? await cache.match(url.pathname, { ignoreVary: true }) : undefined;

        return hit ?? (await cache.match(OFFLINE, { ignoreVary: true })) ?? Response.error();
    }
}

async function cacheFirst(event, cacheName) {
    const { request } = event;
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);

    if (hit) {
        return hit;
    }

    const response = await fetch(request);

    // Opaque responses come from no-cors loads (a worker's importScripts);
    // they cannot be inspected, but they are the bytes that worked.
    if (response.ok || response.type === "opaque") {
        event.waitUntil(cache.put(request, response.clone()));
    }

    return response;
}

async function warmOnce(locale) {
    const warmed = await readWarmed();

    if (warmed && warmed.version === version && warmed.locale === locale) {
        return;
    }

    await warm(locale);
}

/** Every asset and page this build lists. Recorded only when nothing failed. */
async function warm(locale) {
    const cache = await caches.open(STATIC);
    const jobs = [...assets.map((url) => () => keepAsset(cache, url)), ...pages.map((url) => () => keepPage(cache, url))];
    let failed = 0;

    await Promise.all(
        Array.from({ length: WARM_CONCURRENCY }, async () => {
            for (let job = jobs.shift(); job; job = jobs.shift()) {
                try {
                    await job();
                } catch {
                    failed += 1;
                }
            }
        }),
    );

    if (failed === 0) {
        const state = await caches.open(STATE);

        await state.put(WARMED_KEY, Response.json({ version, locale }));
    }
}

async function keepAsset(cache, url) {
    if (await cache.match(url)) {
        return;
    }

    // Hashed files the previous build already fetched carry over for free.
    if (url.startsWith("/_next/static/")) {
        const previous = await caches.match(url);

        if (previous) {
            await cache.put(url, previous);

            return;
        }
    }

    await cache.add(new Request(url, { cache: "reload" }));
}

/** Always re-fetched: the HTML follows the reader's language cookie. */
async function keepPage(cache, url) {
    const response = await fetch(new Request(url, { cache: "reload" }));

    if (!response.ok || response.redirected) {
        throw new Error(`${url}: ${response.status}`);
    }

    await cache.put(url, response);
}

async function readWarmed() {
    const state = await caches.open(STATE);
    const response = await state.match(WARMED_KEY);

    return response ? response.json() : null;
}
