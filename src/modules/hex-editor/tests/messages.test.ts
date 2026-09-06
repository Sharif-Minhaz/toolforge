import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import en from "@/messages/en.json";
import {
    namespacesInSlice,
    namespacesUsedByClientComponents,
} from "@/modules/tools/tests/client-message-slice";

const COMPONENTS = join(import.meta.dir, "..", "components");

/**
 * The Hex Editor is one island all the way down — the toolbar, the grid, the
 * inspector, both dialogs and the status line are every one of them a client
 * component. That makes it the tool most likely to lose a namespace on its way
 * into `src/app/layout.tsx`, where a missing one fails at runtime and at nothing
 * else: `tsc` sees an object literal, ESLint sees nothing, and locale parity
 * passes because the catalogue itself is complete.
 */
describe("client message slice", () => {
    test("ships every namespace the islands ask for", () => {
        const used = namespacesUsedByClientComponents(COMPONENTS, "hexEditor");
        const shipped = new Set(namespacesInSlice("hexEditor"));

        expect(used.length).toBeGreaterThan(0);
        expect(used.filter((namespace) => !shipped.has(namespace))).toEqual([]);
    });
});

describe("the catalogue entry", () => {
    test("names the tool for everything it does", () => {
        expect(en.tools["hex-editor"].name).toBe("Hex Editor");
        expect(en.tools["hex-editor"].description.length).toBeGreaterThan(60);
    });

    /**
     * The article documents controls that the copy under the tool also
     * describes; a shortcut row with no description renders its own key.
     */
    test("describes every keyboard shortcut the article lists", () => {
        const shortcuts = en.hexEditor.article.shortcuts;

        for (const key of [
            "open",
            "save",
            "saveAs",
            "find",
            "goTo",
            "undo",
            "redo",
            "column",
            "move",
            "extend",
            "selectAll",
            "rowEnds",
            "documentEnds",
            "page",
            "zero",
            "back",
        ] as const) {
            expect(shortcuts[key].length).toBeGreaterThan(8);
        }
    });
});
