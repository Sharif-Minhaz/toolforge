import { describe, expect, test } from "bun:test";

import { checkTarget, toCreatedView, toLinkView } from "@/modules/qr/domain/dynamic-view";
import { MAX_TARGET_URL_LENGTH } from "@/modules/qr/domain/constants";
import type { DynamicQrLink } from "@/modules/qr/types";

const ORIGIN = "https://toolforge.example";

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

    test("refuses to point one short link at another", () => {
        expect(checkTarget("https://toolforge.example/q/bcdfghjk", ORIGIN)).toEqual({
            ok: false,
            reason: "self_referential",
        });
    });

    test("an ordinary page on the same host is fine", () => {
        expect(checkTarget("https://toolforge.example/tools/uuid", ORIGIN)).toEqual({
            ok: true,
            value: "https://toolforge.example/tools/uuid",
        });
    });
});

describe("view shapes", () => {
    const link: DynamicQrLink = {
        slug: "bcdfghjk",
        target: "https://example.com/promo",
        scans: 12,
        createdAt: new Date("2026-08-01T10:15:00.000Z"),
        lastScanAt: new Date("2026-08-02T09:00:00.000Z"),
    };

    test("timestamps cross the boundary as ISO strings", () => {
        expect(toLinkView(link, ORIGIN)).toEqual({
            slug: "bcdfghjk",
            shortUrl: "https://toolforge.example/q/bcdfghjk",
            target: "https://example.com/promo",
            scans: 12,
            createdAt: "2026-08-01T10:15:00.000Z",
            lastScanAt: "2026-08-02T09:00:00.000Z",
        });
    });

    test("a code nobody has scanned has no last scan", () => {
        expect(toLinkView({ ...link, scans: 0, lastScanAt: null }, ORIGIN).lastScanAt).toBeNull();
    });

    test("the created view carries the one-time edit link", () => {
        const token = "b".repeat(40);

        expect(toCreatedView(link, token, ORIGIN).editUrl).toBe(
            `https://toolforge.example/tools/qr/edit/${token}`,
        );
    });
});
