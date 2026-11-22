import { describe, expect, test } from "bun:test";

import {
    MAX_TARGET_URL_LENGTH,
    QR_EDIT_PREFIX,
    QR_REDIRECT_PREFIX,
    REDIRECT_PREFIXES,
    SHORTENER_REDIRECT_PREFIX,
} from "@/modules/short-links/domain/constants";
import { isSelfReferential, linkBases, parseTargetUrl } from "@/modules/short-links/domain/target";

const ORIGIN = "https://toolforge.example";

describe("parseTargetUrl", () => {
    test("normalises a destination", () => {
        expect(parseTargetUrl("  https://example.com/promo  ")).toEqual({
            ok: true,
            url: "https://example.com/promo",
        });
    });

    test("prefixes a bare host, which is what somebody pasting one meant", () => {
        expect(parseTargetUrl("example.com/promo")).toEqual({
            ok: true,
            url: "https://example.com/promo",
        });
    });

    test("keeps http, because plenty of intranet destinations are only that", () => {
        expect(parseTargetUrl("http://intranet.local/wiki")).toEqual({
            ok: true,
            url: "http://intranet.local/wiki",
        });
    });

    test("refuses every scheme that would make this a hosted attack", () => {
        for (const value of [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "vbscript:msgbox(1)",
        ]) {
            expect(parseTargetUrl(value)).toEqual({ ok: false, reason: "unsupported_scheme" });
        }
    });

    test("reports empty, unparseable and oversized apart", () => {
        expect(parseTargetUrl("   ")).toEqual({ ok: false, reason: "empty" });
        expect(parseTargetUrl("https://")).toEqual({ ok: false, reason: "not_a_url" });
        expect(parseTargetUrl("h ttp://x")).toEqual({ ok: false, reason: "not_a_url" });
        expect(parseTargetUrl("a".repeat(MAX_TARGET_URL_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("the length ceiling is measured before the scheme is added", () => {
        // Exactly at the limit, and still a bare host — so the `https://` this
        // adds must not be what pushes it over.
        const host = `${"a".repeat(MAX_TARGET_URL_LENGTH - 4)}.com`;

        expect(parseTargetUrl(host).ok).toBe(true);
    });
});

describe("isSelfReferential", () => {
    test("catches both redirect prefixes, not just the caller's own", () => {
        for (const prefix of REDIRECT_PREFIXES) {
            expect(isSelfReferential(`${ORIGIN}${prefix}/abcd2345`, ORIGIN)).toBe(true);
            expect(isSelfReferential(`${ORIGIN}${prefix}`, ORIGIN)).toBe(true);
        }
    });

    test("a chain across the two tools is still a chain", () => {
        expect(isSelfReferential(`${ORIGIN}${QR_REDIRECT_PREFIX}/abcd2345`, ORIGIN)).toBe(true);
        expect(isSelfReferential(`${ORIGIN}${SHORTENER_REDIRECT_PREFIX}/summer-sale`, ORIGIN)).toBe(
            true,
        );
    });

    test("leaves the rest of this site, and the rest of the web, alone", () => {
        expect(isSelfReferential(`${ORIGIN}/tools/qr`, ORIGIN)).toBe(false);
        expect(isSelfReferential(`${ORIGIN}/quarterly-report`, ORIGIN)).toBe(false);
        expect(isSelfReferential("https://example.com/s/abcd2345", ORIGIN)).toBe(false);
    });

    test("an unparseable value is not self-referential, only invalid", () => {
        expect(isSelfReferential("not a url", ORIGIN)).toBe(false);
    });

    test("refuses every path on the short-link subdomain", () => {
        expect(isSelfReferential("https://s.example.net/anything", ORIGIN, "example.net")).toBe(
            true,
        );
        expect(isSelfReferential("https://s.example.net/anything", ORIGIN, null)).toBe(false);
    });
});

describe("linkBases", () => {
    test("builds both bases from the tool's prefixes", () => {
        expect(linkBases("shortener", ORIGIN, null, null)).toEqual({
            redirect: `${ORIGIN}${SHORTENER_REDIRECT_PREFIX}`,
            edit: `${ORIGIN}/tools/shortener/edit`,
        });
        expect(linkBases("qr", ORIGIN, null, null).edit).toBe(`${ORIGIN}${QR_EDIT_PREFIX}`);
    });

    test("a trailing slash on the origin does not double up", () => {
        expect(linkBases("qr", `${ORIGIN}/`, null, null).redirect).toBe(
            `${ORIGIN}${QR_REDIRECT_PREFIX}`,
        );
    });

    test("a shortener link moves to the subdomain only when served inside the domain", () => {
        expect(linkBases("shortener", ORIGIN, "toolforge.example", "toolforge.example")).toEqual({
            redirect: "https://s.toolforge.example",
            edit: `${ORIGIN}/tools/shortener/edit`,
        });
        expect(
            linkBases("shortener", ORIGIN, "toolforge.vercel.app", "toolforge.example").redirect,
        ).toBe(`${ORIGIN}/s`);
    });

    test("a QR link never leaves the main site's path", () => {
        expect(linkBases("qr", ORIGIN, "toolforge.example", "toolforge.example").redirect).toBe(
            `${ORIGIN}/q`,
        );
    });
});
