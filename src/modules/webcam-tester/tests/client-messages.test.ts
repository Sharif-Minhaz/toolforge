import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import en from "@/messages/en.json";
import {
    CLIENT_SLICE_LAYOUT,
    namespacesInSlice,
    namespacesUsedByClientComponents,
} from "@/modules/tools/tests/client-message-slice";

/**
 * Every namespace this tool's client components ask for has to be in the
 * layout's slice — see `tools/tests/client-message-slice.ts` for why that is a
 * rule nothing else in the pipeline enforces.
 */

const COMPONENTS_DIR = join(import.meta.dir, "..", "components");
const MODULE = "webcamTester";

describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents(COMPONENTS_DIR, MODULE);

    test("the scan finds something, or it is asserting nothing", () => {
        expect(used.length).toBeGreaterThan(2);
    });

    test("carries every namespace a client component asks for", () => {
        const missing = used.filter((namespace) => !namespacesInSlice(MODULE).includes(namespace));

        expect(missing).toEqual([]);
    });

    test("names only namespaces the catalogue actually has", () => {
        const catalogue = Object.keys(en.webcamTester);
        const unknown = namespacesInSlice(MODULE).filter(
            (namespace) => !catalogue.includes(namespace),
        );

        expect(unknown).toEqual([]);
    });

    // The device picker and failure notice read a namespace of their own, so
    // the microphone tester can share them.
    test("ships the shared media-device copy whole", () => {
        expect(readFileSync(CLIENT_SLICE_LAYOUT, "utf8")).toMatch(
            /^\s*mediaDevices: messages\.mediaDevices,/mu,
        );
    });
});
