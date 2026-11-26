import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import en from "@/messages/en.json";
import {
    namespacesInSlice,
    namespacesUsedByClientComponents,
} from "@/modules/tools/tests/client-message-slice";

/**
 * Every namespace this tool's client components ask for has to be in the
 * layout's slice — see `tools/tests/client-message-slice.ts` for why that is a
 * rule nothing else in the pipeline enforces.
 */

const COMPONENTS_DIR = join(import.meta.dir, "..", "components");
const MODULE = "faviconGenerator";

describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents(COMPONENTS_DIR, MODULE);

    test("the scan finds something, or it is asserting nothing", () => {
        expect(used.length).toBeGreaterThanOrEqual(5);
        expect(namespacesInSlice(MODULE).length).toBeGreaterThanOrEqual(5);
    });

    test("carries every namespace a client component asks for", () => {
        const missing = used.filter((namespace) => !namespacesInSlice(MODULE).includes(namespace));

        expect(missing).toEqual([]);
    });

    test("names only namespaces the catalogue actually has", () => {
        const catalogue = Object.keys(en.faviconGenerator);
        const unknown = namespacesInSlice(MODULE).filter(
            (namespace) => !catalogue.includes(namespace),
        );

        expect(unknown).toEqual([]);
    });
});
