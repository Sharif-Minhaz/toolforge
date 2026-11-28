import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every tool page draws its header through `ToolPageHeader`, and its loading
 * state through `ToolPageHeaderSkeleton`. A page that copies the markup instead
 * silently loses the "Improve" menu — nothing else would notice.
 */
const TOOLS_ROUTE = join(import.meta.dir, "..", "..", "..", "app", "[locale]", "tools");

const toolRoutes = readdirSync(TOOLS_ROUTE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe("tool page headers", () => {
    test("the scan finds the tool routes, or it is asserting nothing", () => {
        expect(toolRoutes.length).toBeGreaterThan(50);
    });

    test.each(toolRoutes)("%s renders the shared header for its own id", (route) => {
        const page = readFileSync(join(TOOLS_ROUTE, route, "page.tsx"), "utf8");

        expect(page).toContain("<ToolPageHeader");
        expect(page).toContain(`toolId="${route}"`);
        expect(page).not.toContain('tNav("breadcrumb")');
    });

    test.each(toolRoutes)("%s loads with the shared header skeleton", (route) => {
        const loading = join(TOOLS_ROUTE, route, "loading.tsx");

        expect(existsSync(loading)).toBe(true);
        expect(readFileSync(loading, "utf8")).toContain("<ToolPageHeaderSkeleton");
    });
});
