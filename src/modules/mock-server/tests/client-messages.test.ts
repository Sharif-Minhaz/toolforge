import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import en from "@/messages/en.json";

/**
 * Every namespace a client component asks for has to be in the layout's slice.
 *
 * `src/app/layout.tsx` hands `NextIntlClientProvider` a hand-picked subset of
 * the catalogue, so long-form article copy never crosses to the browser. The
 * cost of that is a rule somebody has to remember — *"when a new client
 * component needs a namespace, add it to that slice explicitly"* — and forgetting
 * it is invisible to every check the project runs. `tsc` sees a plain object
 * literal, ESLint sees nothing, and the catalogue itself is complete, so locale
 * parity passes too. What you get is `MISSING_MESSAGE` at runtime, on the one
 * page nobody opened before shipping.
 *
 * It has already happened once, to `mockServer.export`. This is the check that
 * would have caught it.
 *
 * Scanning source is unusual for a test here and is the point: the fact being
 * asserted is a relationship between two files that nothing else relates. It is
 * scoped to this module's components rather than the whole repository, so it
 * stays fast and its failure names something local.
 */

const COMPONENTS_DIR = join(import.meta.dir, "..", "components");
const LAYOUT = join(import.meta.dir, "..", "..", "..", "app", "layout.tsx");

/** `useTranslations("mockServer.builder")` → `builder`. */
function namespacesUsedByClientComponents(): readonly string[] {
    const found = new Set<string>();

    for (const file of readdirSync(COMPONENTS_DIR)) {
        if (!file.endsWith(".tsx")) {
            continue;
        }

        const source = readFileSync(join(COMPONENTS_DIR, file), "utf8");

        // Only files that actually run in the browser. A server component reads
        // the whole catalogue and is not what this is about.
        if (!source.startsWith('"use client"')) {
            continue;
        }

        for (const match of source.matchAll(/useTranslations\("mockServer\.([A-Za-z]+)"\)/gu)) {
            found.add(match[1]);
        }
    }

    return [...found].sort();
}

/** The keys of the `mockServer` object inside the client slice. */
function namespacesInSlice(): readonly string[] {
    const source = readFileSync(LAYOUT, "utf8");
    const found = new Set<string>();

    for (const match of source.matchAll(/([A-Za-z]+): messages\.mockServer\.([A-Za-z]+)/gu)) {
        found.add(match[1]);
    }

    return [...found].sort();
}

describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents();

    test("the scan finds something, or it is asserting nothing", () => {
        // A regex that silently stops matching would make every test below
        // pass for the wrong reason.
        expect(used.length).toBeGreaterThan(10);
        expect(namespacesInSlice().length).toBeGreaterThan(10);
    });

    test("carries every namespace a client component asks for", () => {
        const missing = used.filter((namespace) => !namespacesInSlice().includes(namespace));

        expect(missing).toEqual([]);
    });

    /** A namespace in the slice that no longer exists sends `undefined` across. */
    test("names only namespaces the catalogue actually has", () => {
        const catalogue = Object.keys(en.mockServer);
        const unknown = namespacesInSlice().filter((namespace) => !catalogue.includes(namespace));

        expect(unknown).toEqual([]);
    });
});
