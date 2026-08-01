import { describe, expect, test } from "bun:test";

import {
    decideRedirect,
    REDIRECT_HEADERS,
    redirectResponse,
} from "@/modules/short-links/domain/redirect";
import type { RedirectRecord } from "@/modules/short-links/types";

const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);

const MINUTE = 60_000;

function record(overrides: Partial<RedirectRecord> = {}): RedirectRecord {
    return {
        target: "https://example.com/promo",
        passwordHash: null,
        startsAt: null,
        expiresAt: null,
        ...overrides,
    };
}

describe("decideRedirect", () => {
    test("an open, live link redirects to its normalised target", () => {
        expect(decideRedirect(record(), NOW)).toEqual({
            kind: "redirect",
            target: "https://example.com/promo",
        });
    });

    test("a row that is not there is missing, not an error", () => {
        expect(decideRedirect(null, NOW)).toEqual({ kind: "missing" });
    });

    test("the window is checked before the password", () => {
        // Otherwise an expired link would invite a stranger to guess at a
        // password that could not have worked anyway.
        const expired = record({
            passwordHash: "pbkdf2$sha256$1$AA$AA",
            expiresAt: new Date(NOW - MINUTE),
        });

        expect(decideRedirect(expired, NOW)).toEqual({ kind: "expired" });
    });

    test("a link before its start is pending, not missing", () => {
        expect(decideRedirect(record({ startsAt: new Date(NOW + MINUTE) }), NOW)).toEqual({
            kind: "pending",
        });
    });

    test("a gated link never reveals its destination", () => {
        const decision = decideRedirect(record({ passwordHash: "pbkdf2$sha256$1$AA$AA" }), NOW);

        expect(decision).toEqual({ kind: "password" });
        expect(JSON.stringify(decision)).not.toContain("example.com");
    });

    test("a stored target that went bad is missing rather than a bad Location header", () => {
        for (const target of ["javascript:alert(1)", "not a url", ""]) {
            expect(decideRedirect(record({ target }), NOW)).toEqual({ kind: "missing" });
        }
    });

    test("the expiry boundary is exclusive on both sides of the decision", () => {
        expect(decideRedirect(record({ expiresAt: new Date(NOW) }), NOW).kind).toBe("expired");
        expect(decideRedirect(record({ expiresAt: new Date(NOW + 1) }), NOW).kind).toBe("redirect");
    });
});

describe("redirectResponse", () => {
    test("a live hop is 302, because the destination is meant to change", () => {
        expect(redirectResponse("https://example.com", 302).status).toBe(302);
    });

    test("carries every header that keeps a pointer from behaving like content", () => {
        const response = redirectResponse("https://example.com/promo", 302);

        expect(response.headers.get("Location")).toBe("https://example.com/promo");
        expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    });

    test("never sends a body a redirect has no use for", async () => {
        expect(await redirectResponse("/tools/shortener", 307).text()).toBe("");
    });

    test("no header is silently dropped from the shared set", () => {
        const response = redirectResponse("/x", 307);

        for (const [name, value] of Object.entries(REDIRECT_HEADERS)) {
            expect(response.headers.get(name)).toBe(value);
        }
    });
});
