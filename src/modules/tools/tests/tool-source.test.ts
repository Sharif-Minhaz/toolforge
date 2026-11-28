import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SITE_REPOSITORY } from "@/modules/seo/domain/site";
import { TOOL_ISSUE_TEMPLATE, toolModuleDirectory, toolSourceLinks } from "../domain/tool-source";
import { TOOL_IDS } from "../types";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

describe("toolModuleDirectory", () => {
    // A dead "Edit on GitHub" link is invisible until somebody clicks it.
    test.each([...TOOL_IDS])("%s points at a directory that exists", (toolId) => {
        expect(existsSync(join(REPO_ROOT, toolModuleDirectory(toolId)))).toBe(true);
    });

    test("follows the override where the module is named differently", () => {
        expect(toolModuleDirectory("zakat-calculator")).toBe("src/modules/zakat");
        expect(toolModuleDirectory("age-calculator")).toBe("src/modules/age-calculator");
    });
});

describe("toolSourceLinks", () => {
    test("opens the module on the default branch", () => {
        expect(toolSourceLinks("zakat-calculator").sourceUrl).toBe(
            `${SITE_REPOSITORY}/tree/main/src/modules/zakat`,
        );
    });

    test("opens the tool issue form, naming the tool and its page", () => {
        const url = new URL(toolSourceLinks("age-calculator").issueUrl);

        expect(`${url.origin}${url.pathname}`).toBe(`${SITE_REPOSITORY}/issues/new`);
        expect(url.searchParams.get("template")).toBe(TOOL_ISSUE_TEMPLATE);
        expect(url.searchParams.get("title")).toBe("[age-calculator] ");
        expect(url.searchParams.get("tool")).toBe("age-calculator");
        expect(new URL(url.searchParams.get("page") ?? "").pathname).toBe("/tools/age-calculator");
    });

    test("uses the catalogue route for a tool outside /tools", () => {
        const url = new URL(toolSourceLinks("mock-server").issueUrl);

        expect(new URL(url.searchParams.get("page") ?? "").pathname).toBe("/mock");
    });

    test("never carries a query string into the page address", () => {
        for (const toolId of TOOL_IDS) {
            const page = new URL(toolSourceLinks(toolId).issueUrl).searchParams.get("page") ?? "";

            expect(new URL(page).search).toBe("");
        }
    });

    test("fills only fields the issue form declares", () => {
        const form = readFileSync(
            join(REPO_ROOT, ".github", "ISSUE_TEMPLATE", TOOL_ISSUE_TEMPLATE),
            "utf8",
        );
        const filled = [...new URL(toolSourceLinks("uuid").issueUrl).searchParams.keys()].filter(
            (key) => key !== "template" && key !== "title",
        );

        for (const field of filled) {
            expect(form).toContain(`id: ${field}`);
        }
    });
});
