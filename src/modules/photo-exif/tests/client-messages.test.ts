import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
    namespacesInSlice,
    namespacesUsedByClientComponents,
} from "@/modules/tools/tests/client-message-slice";

/**
 * Every namespace this tool's client components ask for has to be in the
 * layout's slice — see `tools/tests/client-message-slice.ts` for why that is a
 * rule nothing else in the pipeline enforces.
 */
describe("the client message slice", () => {
    const used = namespacesUsedByClientComponents(
        join(import.meta.dir, "..", "components"),
        "photoExif",
    );

    test("the scan finds something, or it is asserting nothing", () => {
        expect(used.length).toBeGreaterThan(1);
    });

    test("carries every namespace a client component asks for", () => {
        expect(
            used.filter((namespace) => !namespacesInSlice("photoExif").includes(namespace)),
        ).toEqual([]);
    });
});
