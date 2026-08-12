import { describe, expect, test } from "bun:test";

import { ALLOWED_PUBLIC_URL_SCHEMES, checkPublicUrl } from "@/modules/tools/domain/public-url";

describe("checkPublicUrl", () => {
    test("accepts https", () => {
        expect(checkPublicUrl("https://cdn.example.com/cat.png").ok).toBe(true);
    });

    test("accepts http", () => {
        expect(checkPublicUrl("http://cdn.example.com/cat.png").ok).toBe(true);
    });

    test("trims surrounding whitespace", () => {
        expect(checkPublicUrl("  https://example.com/a.png  ").ok).toBe(true);
    });

    test("refuses something that is not a URL", () => {
        expect(checkPublicUrl("not a url")).toEqual({ ok: false, reason: "invalid_url" });
    });

    test("refuses the empty string", () => {
        expect(checkPublicUrl("")).toEqual({ ok: false, reason: "invalid_url" });
    });

    test("refuses every scheme but http and https", () => {
        const refused = [
            "file:///etc/passwd",
            "data:image/png;base64,iVBORw0KGgo=",
            "ftp://example.com/a.png",
            "javascript:alert(1)",
            "gopher://example.com/",
        ];

        for (const raw of refused) {
            expect(checkPublicUrl(raw)).toEqual({ ok: false, reason: "scheme_not_allowed" });
        }
    });

    test("exposes exactly the two allowed schemes", () => {
        expect(ALLOWED_PUBLIC_URL_SCHEMES).toEqual(["http:", "https:"]);
    });

    test("refuses credentials in the authority", () => {
        expect(checkPublicUrl("https://user:pass@example.com/a.png")).toEqual({
            ok: false,
            reason: "invalid_url",
        });
        expect(checkPublicUrl("https://user@example.com/a.png")).toEqual({
            ok: false,
            reason: "invalid_url",
        });
    });

    test("passes a name that resolves privately — shape is not safety", () => {
        // The whole point of the address guard existing separately: this is a
        // perfectly well-formed public URL and the attack it is named after.
        expect(checkPublicUrl("http://metadata.attacker.example/latest/meta-data/").ok).toBe(true);
    });
});
