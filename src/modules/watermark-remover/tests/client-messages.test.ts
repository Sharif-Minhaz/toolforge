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
 *
 * This is the check that would have caught `watermarkRemover.gemini`: the whole
 * Gemini tab shipped with its catalogue entries present in both locales, `tsc`
 * green and `bun test` green, and threw `MISSING_MESSAGE` the moment a browser
 * rendered the panel.
 */

const COMPONENTS_DIR = join(import.meta.dir, "..", "components");
const MODULE = "watermarkRemover";

describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents(COMPONENTS_DIR, MODULE);

    test("the scan finds something, or it is asserting nothing", () => {
        // A regex that silently stops matching would make every test below
        // pass for the wrong reason.
        expect(used.length).toBeGreaterThan(6);
        expect(namespacesInSlice(MODULE).length).toBeGreaterThan(6);
    });

    test("carries every namespace a client component asks for", () => {
        const missing = used.filter((namespace) => !namespacesInSlice(MODULE).includes(namespace));

        expect(missing).toEqual([]);
    });

    /** A namespace in the slice that no longer exists sends `undefined` across. */
    test("names only namespaces the catalogue actually has", () => {
        const catalogue = Object.keys(en.watermarkRemover);
        const unknown = namespacesInSlice(MODULE).filter(
            (namespace) => !catalogue.includes(namespace),
        );

        expect(unknown).toEqual([]);
    });
});
