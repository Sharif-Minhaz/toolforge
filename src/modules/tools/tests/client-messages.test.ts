import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLIENT_SLICE_LAYOUT } from "./client-message-slice";

/**
 * The shared components' half of the client-slice rule. A namespace a shared
 * island reads has to be in the slice `layout.tsx` ships, and missing it is
 * invisible to every other check — `codeViewer` rendered its raw keys on the
 * first page that opened the JSON viewer.
 *
 * Only the top-level name is checked: the shared namespaces are shipped whole
 * or as an object of their own, and either shape starts with `name:`.
 */
const COMPONENTS = join(import.meta.dir, "..", "components");

function topLevelNamespaces(): readonly string[] {
    const found = new Set<string>();

    for (const file of readdirSync(COMPONENTS)) {
        if (!file.endsWith(".tsx")) {
            continue;
        }

        const source = readFileSync(join(COMPONENTS, file), "utf8");

        if (!source.startsWith('"use client"')) {
            continue;
        }

        for (const match of source.matchAll(/useTranslations\("([A-Za-z]+)/gu)) {
            found.add(match[1]);
        }
    }

    return [...found].sort();
}

describe("shared components — client message slice", () => {
    const layout = readFileSync(CLIENT_SLICE_LAYOUT, "utf8");

    for (const namespace of topLevelNamespaces()) {
        test(`ships ${namespace} to the browser`, () => {
            expect(layout).toMatch(new RegExp(`^\\s*${namespace}: `, "mu"));
        });
    }
});
