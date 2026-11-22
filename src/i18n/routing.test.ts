import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { localizePath, resolveLocale, UNLOCALIZED_ROUTES } from "./routing";

describe("localizePath", () => {
    test("prefixes pages with the locale", () => {
        expect(localizePath("/", "en")).toBe("/en");
        expect(localizePath("/tools/uuid", "bn")).toBe("/bn/tools/uuid");
        expect(localizePath("/mock/abc/servers/def", "en")).toBe("/en/mock/abc/servers/def");
    });

    test("leaves route handlers alone, but not paths that merely share a prefix", () => {
        expect(localizePath("/api/mcp", "en")).toBeNull();
        expect(localizePath("/m/key/users", "en")).toBeNull();
        expect(localizePath("/s/alias", "en")).toBeNull();
        expect(localizePath("/s", "en")).toBeNull();
        expect(localizePath("/settings", "en")).toBe("/en/settings");
    });

    test("leaves files and framework paths alone", () => {
        expect(localizePath("/robots.txt", "en")).toBeNull();
        expect(localizePath("/manifest.webmanifest", "en")).toBeNull();
        expect(localizePath("/fonts/noto.ttf", "en")).toBeNull();
        expect(localizePath("/_next/data/x", "en")).toBeNull();
    });

    test("a path already carrying a locale is prefixed again, so it 404s instead of duplicating", () => {
        expect(localizePath("/en/tools/uuid", "en")).toBe("/en/en/tools/uuid");
    });
});

describe("resolveLocale", () => {
    test("falls back to the default for a missing or unknown cookie", () => {
        expect(resolveLocale(undefined)).toBe("en");
        expect(resolveLocale("fr")).toBe("en");
        expect(resolveLocale("bn")).toBe("bn");
    });
});

test("every top-level route folder outside [locale] is listed as unlocalized", () => {
    const appDir = join(import.meta.dir, "..", "app");
    const folders = readdirSync(appDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "[locale]")
        .map((entry) => `/${entry.name}`);

    expect(folders.filter((folder) => !UNLOCALIZED_ROUTES.includes(folder))).toEqual([]);
});
