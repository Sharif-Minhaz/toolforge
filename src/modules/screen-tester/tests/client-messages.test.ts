import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import en from "@/messages/en.json";
import {
    namespacesInSlice,
    namespacesUsedByClientComponents,
} from "@/modules/tools/tests/client-message-slice";

/**
 * Every namespace the workbench and the test screen ask for has to be in the
 * layout's slice — see `tools/tests/client-message-slice.ts` for why nothing
 * else in the pipeline enforces it.
 */

const COMPONENTS_DIR = join(import.meta.dir, "..", "components");
const MODULE = "screenTester";

describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents(COMPONENTS_DIR, MODULE);

    test("the scan finds something, or it is asserting nothing", () => {
        expect(used).toEqual(["patterns", "workbench"]);
    });

    test("carries every namespace a client component asks for", () => {
        const missing = used.filter((namespace) => !namespacesInSlice(MODULE).includes(namespace));

        expect(missing).toEqual([]);
    });

    /** A namespace in the slice that no longer exists sends `undefined` across. */
    test("names only namespaces the catalogue actually has", () => {
        const catalogue = Object.keys(en.screenTester);
        const unknown = namespacesInSlice(MODULE).filter(
            (namespace) => !catalogue.includes(namespace),
        );

        expect(unknown).toEqual([]);
    });
});
