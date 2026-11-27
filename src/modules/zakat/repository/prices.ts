import "server-only";

import { cacheLife } from "next/cache";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    BAJUS_PRICE_URL,
    FAWAZ_METAL_URLS,
    FAWAZ_USD_URLS,
    FRANKFURTER_RATES_URL,
    GOLD_API_URLS,
    MAX_PRICE_RESPONSE_BYTES,
    PRICE_FETCH_TIMEOUT_MS,
} from "../domain/price-sources";
import {
    readBajus,
    readFawazMetal,
    readFawazRates,
    readFrankfurter,
    readGoldApi,
} from "../domain/prices";
import type { BajusPrices, MetalQuote, PriceSnapshot, RateTable } from "../types";

/**
 * Where the live prices come from, and how long one reading is trusted.
 *
 * **Not the SSRF problem.** Every destination is a constant in
 * `domain/constants.ts`; nothing a reader types reaches a URL here, so part one
 * of `docs/patterns/outbound-requests.md` does not apply. What does apply is
 * that these are free services run by other people: every call has a timeout,
 * every body a byte ceiling, and redirects are refused — a feed that has moved
 * is a feed to stop believing, not one to follow somewhere else.
 *
 * **Cached per deployment, not per visitor.** Each source is fetched at most
 * once per `revalidate` window by the whole site, which is what keeps a free
 * feed's patience intact — gold-api asks callers not to send several requests
 * a second, and a page view per visitor would. A source that fails **throws**
 * inside its cache scope, so the failure is not cached: the next visitor tries
 * again rather than inheriting a quarter of an hour of "unavailable".
 *
 * **Primary, then fallback, then nothing.** Spot comes from gold-api.com (live)
 * and falls back to currency-api's daily fix, which the result labels as
 * yesterday's price. Exchange rates come from Frankfurter and fall back to the
 * same currency-api. When everything fails the snapshot says so, field by
 * field, and the page asks the reader for a price instead — the calculator never
 * invents one.
 */

const USER_AGENT = "ToolForge-Zakat/1.0 (+https://github.com/Sharif-Minhaz/toolforge)";

class UpstreamError extends Error {
    constructor(
        readonly url: string,
        readonly detail: string,
    ) {
        super(`${url}: ${detail}`);
        this.name = "UpstreamError";
    }
}

async function readCapped(response: Response, url: string): Promise<string> {
    const body = response.body;

    if (body === null) {
        return "";
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            bytes += value.byteLength;

            if (bytes > MAX_PRICE_RESPONSE_BYTES) {
                throw new UpstreamError(url, "response_too_large");
            }

            chunks.push(decoder.decode(value, { stream: true }));
        }

        chunks.push(decoder.decode());

        return chunks.join("");
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

async function fetchText(url: string, accept: string): Promise<string> {
    const response = await fetch(url, {
        headers: { accept, "user-agent": USER_AGENT },
        redirect: "manual",
        // The framework's fetch cache is bypassed: the `use cache` scopes
        // below are the one place a reading's lifetime is decided.
        cache: "no-store",
        signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new UpstreamError(url, `status_${response.status}`);
    }

    return readCapped(response, url);
}

async function fetchJson(url: string): Promise<unknown> {
    const text = await fetchText(url, "application/json");

    try {
        return JSON.parse(text);
    } catch {
        throw new UpstreamError(url, "invalid_json");
    }
}

/** The first URL in the list that answers with something `read` accepts. */
async function firstReadable<T>(
    urls: readonly string[],
    read: (body: unknown) => T | null,
): Promise<T> {
    let lastError: unknown = null;

    for (const url of urls) {
        try {
            const value = read(await fetchJson(url));

            if (value !== null) {
                return value;
            }

            lastError = new UpstreamError(url, "unreadable");
        } catch (caught) {
            lastError = caught;
        }
    }

    throw lastError ?? new Error("no sources");
}

async function liveSpot(metal: "gold" | "silver"): Promise<MetalQuote> {
    "use cache";
    // Spot moves by the minute; a quarter of an hour is well inside what a
    // yearly calculation can notice, and keeps the free feed's load trivial.
    cacheLife({ stale: 300, revalidate: 900, expire: 3600 });

    return firstReadable(GOLD_API_URLS[metal], (body) => readGoldApi(metal, body));
}

async function dailySpot(metal: "gold" | "silver"): Promise<MetalQuote> {
    "use cache";
    cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

    return firstReadable(FAWAZ_METAL_URLS[metal], (body) => readFawazMetal(metal, body));
}

async function exchangeRates(): Promise<RateTable> {
    "use cache";
    // Both feeds publish once a day.
    cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

    try {
        return await firstReadable([FRANKFURTER_RATES_URL], readFrankfurter);
    } catch (caught) {
        logEvent("warn", "zakat.rates_primary_failed", { error: describeError(caught) });

        return firstReadable(FAWAZ_USD_URLS, readFawazRates);
    }
}

async function bajusPrices(): Promise<BajusPrices> {
    "use cache";
    // BAJUS announces a change a few times a month; an hour is plenty fresh.
    cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

    const prices = readBajus(await fetchText(BAJUS_PRICE_URL, "text/html"));

    if (prices === null) {
        throw new UpstreamError(BAJUS_PRICE_URL, "unreadable");
    }

    return prices;
}

async function spot(metal: "gold" | "silver"): Promise<MetalQuote | null> {
    try {
        return await liveSpot(metal);
    } catch (caught) {
        logEvent("warn", "zakat.spot_live_failed", { metal, error: describeError(caught) });
    }

    try {
        return await dailySpot(metal);
    } catch (caught) {
        logEvent("error", "zakat.spot_unavailable", { metal, error: describeError(caught) });

        return null;
    }
}

async function settle<T>(event: string, task: () => Promise<T>): Promise<T | null> {
    try {
        return await task();
    } catch (caught) {
        logEvent("warn", event, { error: describeError(caught) });

        return null;
    }
}

/**
 * Everything the calculator needs priced, read in parallel. Never throws: a
 * missing part is `null`, and the page says which.
 */
export async function getPriceSnapshot(): Promise<PriceSnapshot> {
    const [gold, silver, rates, bajus] = await Promise.all([
        spot("gold"),
        spot("silver"),
        settle("zakat.rates_unavailable", exchangeRates),
        settle("zakat.bajus_unavailable", bajusPrices),
    ]);

    return { gold, silver, rates, bajus };
}
