import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A page under `app/[locale]` prerenders once per language, and that HTML is
 * served to everybody. A UUID, salt or IV minted in the shell would be the
 * same for every visitor, so per-request work must sit in a `…Section`
 * component behind `<Suspense>` (see docs/patterns/partial-prerendering.md).
 * Next.js also refuses randomness during a prerender; this catches it before
 * a build, and catches the cookie, header and search-param reads too.
 */
const LOCALE_DIR = join(import.meta.dir, "..", "..", "..", "app", "[locale]");

const REQUEST_TIME_CALLS: readonly RegExp[] = [
    /\bawait searchParams\b/,
    /Promise\.all\(\[[^\]]*\bsearchParams\b/s,
    /\bcookies\(\)/,
    /\bheaders\(\)/,
    /\bnew Date\(/,
    /\bDate\.now\(/,
    /\bMath\.random\(/,
    /\bcrypto\./,
    // The server-side generators pages call today.
    /\bgenerateUuids\(/,
    /\brandomSaltHex\(/,
    /\brandomIvHex\(/,
    /\bgenerateRandomText\(/,
    /\bcreateSaltSeed\(/,
    /\bdrawShuffleSeed\(/,
    /\bbuildInitialExample\(/,
];

function staticPages(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);

        if (entry.isDirectory()) {
            // A dynamic segment below `[locale]` has no prerendered page to leak into.
            return entry.name.startsWith("[") ? [] : staticPages(path);
        }

        return entry.name === "page.tsx" ? [path] : [];
    });
}

/** Everything above the first request-time section — the prerendered shell. */
function shellSource(source: string): string {
    const section = source.search(/\nasync function \w+Section\(/);

    const shell = section === -1 ? source : source.slice(0, section);

    // A helper declared above the page is not a call; only calls leak.
    return shell.replace(/function \w+\(/g, "function (");
}

test("finds the tool pages", () => {
    expect(staticPages(LOCALE_DIR).length).toBeGreaterThan(40);
});

test("no prerendered shell reads the request or mints a value", () => {
    const leaks = staticPages(LOCALE_DIR).flatMap((page) => {
        const shell = shellSource(readFileSync(page, "utf8"));

        return REQUEST_TIME_CALLS.filter((pattern) => pattern.test(shell)).map(
            (pattern) => `${relative(LOCALE_DIR, page)}: ${pattern.source}`,
        );
    });

    expect(leaks).toEqual([]);
});
