import { expect, test } from "bun:test";

import { SIDEBAR_BOOT_SCRIPT } from "./sidebar";

function runBootScript(cookie: string): string | null {
    const attributes = new Map<string, string>();
    const document = {
        cookie,
        documentElement: {
            setAttribute: (name: string, value: string) => attributes.set(name, value),
        },
    };
    new Function("document", SIDEBAR_BOOT_SCRIPT)(document);

    return attributes.get("data-sidebar") ?? null;
}

test("boot script marks <html> collapsed only for the collapsed cookie", () => {
    expect(runBootScript("a=1; toolforge.sidebar=collapsed; b=2")).toBe("collapsed");
    expect(runBootScript("toolforge.sidebar=expanded")).toBeNull();
    expect(runBootScript("xtoolforge.sidebar=collapsed")).toBeNull();
    expect(runBootScript("")).toBeNull();
});
