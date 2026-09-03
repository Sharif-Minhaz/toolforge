import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The scan behind every "is this namespace in the client slice?" test.
 *
 * `src/app/layout.tsx` hands `NextIntlClientProvider` a hand-picked subset of
 * the catalogue, so long-form article copy never crosses to the browser. The
 * cost of that is a rule somebody has to remember — *"when a new client
 * component needs a namespace, add it to that slice explicitly"* — and
 * forgetting it is invisible to every check the project runs. `tsc` sees a plain
 * object literal, ESLint sees nothing, and the catalogue itself is complete, so
 * locale parity passes too. What you get is `MISSING_MESSAGE` at runtime, on the
 * one page nobody opened before shipping.
 *
 * It has now happened twice — `mockServer.export`, then `watermarkRemover.gemini`
 * — which is why the scan lives here rather than in either module's tests. A
 * module adds four lines to assert the rule instead of sixty to re-describe it.
 *
 * Scanning source is unusual for a test here and is the point: the fact being
 * asserted is a relationship between two files that nothing else relates. Each
 * caller scopes it to its own components, so it stays fast and its failure names
 * something local.
 */

/** `src/app/layout.tsx`, from anywhere under `src/modules/`. */
export const CLIENT_SLICE_LAYOUT = join(import.meta.dir, "..", "..", "..", "app", "layout.tsx");

/**
 * `useTranslations("mockServer.builder")` → `builder`, over the client
 * components in one directory.
 *
 * Server components are skipped on purpose: one reads the whole catalogue and is
 * not what this is about.
 */
export function namespacesUsedByClientComponents(
    componentsDir: string,
    module: string,
): readonly string[] {
    const pattern = new RegExp(`useTranslations\\("${module}\\.([A-Za-z]+)"\\)`, "gu");
    const found = new Set<string>();

    for (const file of readdirSync(componentsDir)) {
        if (!file.endsWith(".tsx")) {
            continue;
        }

        const source = readFileSync(join(componentsDir, file), "utf8");

        if (!source.startsWith('"use client"')) {
            continue;
        }

        for (const match of source.matchAll(pattern)) {
            found.add(match[1]);
        }
    }

    return [...found].sort();
}

/** The keys of one module's object inside the client slice. */
export function namespacesInSlice(
    module: string,
    layoutPath = CLIENT_SLICE_LAYOUT,
): readonly string[] {
    const pattern = new RegExp(`([A-Za-z]+): messages\\.${module}\\.([A-Za-z]+)`, "gu");
    const source = readFileSync(layoutPath, "utf8");
    const found = new Set<string>();

    for (const match of source.matchAll(pattern)) {
        found.add(match[1]);
    }

    return [...found].sort();
}
