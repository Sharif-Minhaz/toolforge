import { describe, expect, test } from "bun:test";

import {
    MAX_TARGET_URL_LENGTH,
    TOOL_PREFIXES,
    SHORTENER_REDIRECT_PREFIX,
} from "@/modules/short-links/domain/constants";
import {
    checkAlias,
    checkTarget,
    toCreatedView,
    toLinkView,
} from "@/modules/short-links/domain/view";
import type { ShortLink } from "@/modules/short-links/types";

const ORIGIN = "https://toolforge.example";

function link(overrides: Partial<ShortLink> = {}): ShortLink {
    return {
        slug: "abcd2345",
        target: "https://example.com/promo",
        hasPassword: false,
        startsAt: null,
        expiresAt: null,
        scans: 3,
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        lastScanAt: null,
        ...overrides,
    };
}

describe("checkTarget", () => {
    test("accepts a destination and returns it normalised", () => {
        expect(checkTarget("example.com/promo", ORIGIN)).toEqual({
            ok: true,
            value: "https://example.com/promo",
        });
    });

    test("maps each rejection to its own reason", () => {
        expect(checkTarget("  ", ORIGIN)).toEqual({ ok: false, reason: "invalid_target" });
        expect(checkTarget("https://", ORIGIN)).toEqual({ ok: false, reason: "invalid_target" });
        expect(checkTarget("javascript:alert(1)", ORIGIN)).toEqual({
            ok: false,
            reason: "unsupported_scheme",
        });
        expect(checkTarget(`https://e.co/${"a".repeat(MAX_TARGET_URL_LENGTH)}`, ORIGIN)).toEqual({
            ok: false,
            reason: "target_too_long",
        });
    });

    test("refuses to point one short link at another, on either prefix", () => {
        expect(checkTarget(`${ORIGIN}/s/summer-sale`, ORIGIN)).toEqual({
            ok: false,
            reason: "self_referential",
        });
        expect(checkTarget(`${ORIGIN}/q/abcd2345`, ORIGIN)).toEqual({
            ok: false,
            reason: "self_referential",
        });
    });
});

describe("checkAlias", () => {
    test("a blank field means 'draw one for me', not an error", () => {
        expect(checkAlias(null)).toEqual({ ok: true, value: null });
        expect(checkAlias("   ")).toEqual({ ok: true, value: null });
    });

    test("normalises what it accepts", () => {
        expect(checkAlias(" Summer Sale ")).toEqual({ ok: true, value: "summer-sale" });
    });

    test("keeps a reserved word apart from a malformed one", () => {
        expect(checkAlias("login")).toEqual({ ok: false, reason: "alias_reserved" });
        expect(checkAlias("a")).toEqual({ ok: false, reason: "invalid_alias" });
        expect(checkAlias("a--b")).toEqual({ ok: false, reason: "invalid_alias" });
    });
});

describe("toLinkView", () => {
    test("builds the address for the prefix it was given", () => {
        expect(toLinkView(link(), ORIGIN, SHORTENER_REDIRECT_PREFIX).shortUrl).toBe(
            `${ORIGIN}/s/abcd2345`,
        );
        expect(toLinkView(link(), ORIGIN, TOOL_PREFIXES.qr.redirect).shortUrl).toBe(
            `${ORIGIN}/q/abcd2345`,
        );
    });

    test("timestamps cross the boundary as ISO strings, nulls as null", () => {
        const view = toLinkView(
            link({ startsAt: new Date("2026-08-05T09:00:00.000Z") }),
            ORIGIN,
            SHORTENER_REDIRECT_PREFIX,
        );

        expect(view.createdAt).toBe("2026-08-01T10:00:00.000Z");
        expect(view.startsAt).toBe("2026-08-05T09:00:00.000Z");
        expect(view.expiresAt).toBeNull();
        expect(view.lastScanAt).toBeNull();
    });

    test("says a password exists without carrying anything about it", () => {
        const view = toLinkView(link({ hasPassword: true }), ORIGIN, SHORTENER_REDIRECT_PREFIX);

        expect(view.hasPassword).toBe(true);
        expect(Object.keys(view)).not.toContain("passwordHash");
    });
});

describe("toCreatedView", () => {
    test("adds the one-time edit link, on the tool's own edit prefix", () => {
        const view = toCreatedView(link(), "edit-token", ORIGIN, TOOL_PREFIXES.shortener);

        expect(view.shortUrl).toBe(`${ORIGIN}/s/abcd2345`);
        expect(view.editUrl).toBe(`${ORIGIN}/tools/shortener/edit/edit-token`);
    });

    test("the QR tool keeps handing out its own pair of paths from the same row", () => {
        const view = toCreatedView(link(), "edit-token", ORIGIN, TOOL_PREFIXES.qr);

        expect(view.shortUrl).toBe(`${ORIGIN}/q/abcd2345`);
        expect(view.editUrl).toBe(`${ORIGIN}/tools/qr/edit/edit-token`);
    });
});
