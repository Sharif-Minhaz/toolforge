import { describe, expect, test } from "bun:test";

import { detectTechnologies, type DetectionInput } from "@/modules/domain-inspector/domain/detect";
import {
    licenseUrl,
    PROPRIETARY,
    TECHNOLOGY_SIGNATURES,
} from "@/modules/domain-inspector/domain/fingerprints";
import { TECHNOLOGY_CATEGORIES } from "@/modules/domain-inspector/types";

function input(overrides: Partial<DetectionInput> = {}): DetectionInput {
    return {
        headers: {},
        cookieNames: [],
        html: "",
        generator: null,
        mailExchangers: [],
        nameservers: [],
        ...overrides,
    };
}

function idsOf(detection: DetectionInput): string[] {
    return detectTechnologies(detection).map((match) => match.id);
}

describe("the signature table itself", () => {
    test("has no duplicate ids", () => {
        const ids = TECHNOLOGY_SIGNATURES.map((signature) => signature.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test("uses only declared categories", () => {
        for (const signature of TECHNOLOGY_SIGNATURES) {
            expect(TECHNOLOGY_CATEGORIES).toContain(signature.category);
        }
    });

    test("gives every entry a licence", () => {
        for (const signature of TECHNOLOGY_SIGNATURES) {
            expect(signature.license.length).toBeGreaterThan(0);
        }
    });

    test("keeps every pattern free of the global flag", () => {
        // A `g` regex carries `lastIndex` between calls, and this table is
        // module-level state shared by every request the server handles.
        for (const signature of TECHNOLOGY_SIGNATURES) {
            for (const rule of signature.rules) {
                expect(rule.pattern.global).toBe(false);
            }
        }
    });

    test("gives header and cookie rules something to look at", () => {
        for (const signature of TECHNOLOGY_SIGNATURES) {
            for (const rule of signature.rules) {
                if (rule.source === "header" || rule.source === "cookie") {
                    expect(rule.key).toBeDefined();
                    expect(rule.key).toBe(rule.key?.toLowerCase() ?? "");
                }
            }
        }
    });
});

describe("licenseUrl", () => {
    test("points an SPDX identifier at its own page", () => {
        expect(licenseUrl("MIT")).toBe("https://spdx.org/licenses/MIT.html");
    });

    test("has nowhere to point for something with no public licence", () => {
        expect(licenseUrl(PROPRIETARY)).toBeNull();
    });
});

describe("detectTechnologies", () => {
    test("finds nothing in an empty page", () => {
        expect(detectTechnologies(input())).toEqual([]);
    });

    test("names a server from its header and captures the version", () => {
        const [match] = detectTechnologies(input({ headers: { server: "nginx/1.27.4" } }));

        expect(match).toMatchObject({
            id: "nginx",
            name: "nginx",
            category: "server",
            license: "BSD-2-Clause",
            version: "1.27.4",
            evidence: { source: "header", key: "server" },
        });
    });

    test("names a server with no version attached", () => {
        expect(detectTechnologies(input({ headers: { server: "nginx" } }))[0].version).toBeNull();
    });

    test("reads a CMS out of its generator tag", () => {
        const [match] = detectTechnologies(input({ generator: "WordPress 6.5.2" }));

        expect(match).toMatchObject({
            id: "wordpress",
            license: "GPL-2.0-or-later",
            version: "6.5.2",
            evidence: { source: "generator", key: null },
        });
    });

    test("reads a CMS out of the markup when it declares no generator", () => {
        expect(idsOf(input({ html: '<img src="/wp-content/uploads/a.png">' }))).toContain(
            "wordpress",
        );
    });

    test("detects a framework from a cookie name and never from its value", () => {
        const [match] = detectTechnologies(input({ cookieNames: ["laravel_session"] }));

        expect(match).toMatchObject({
            id: "laravel",
            evidence: { source: "cookie", key: "laravel_session" },
        });
    });

    test("names the mail provider from the MX delegation", () => {
        const [match] = detectTechnologies(
            input({ mailExchangers: ["aspmx.l.google.com", "alt1.aspmx.l.google.com"] }),
        );

        expect(match).toMatchObject({
            id: "google-workspace",
            category: "mail",
            evidence: { source: "mx", key: "aspmx.l.google.com" },
        });
    });

    test("names the DNS operator from the delegation", () => {
        expect(idsOf(input({ nameservers: ["kim.ns.cloudflare.com"] }))).toContain(
            "cloudflare-dns",
        );
    });

    test("captures an Angular version out of its root attribute", () => {
        const [match] = detectTechnologies(input({ html: '<app-root ng-version="17.3.1">' }));

        expect(match).toMatchObject({ id: "angular", version: "17.3.1" });
    });

    test("reports each technology once, on its first matching rule", () => {
        const ids = idsOf(
            input({
                headers: { "x-powered-by": "Next.js" },
                html: '<script src="/_next/static/chunks/main.js"></script>',
            }),
        );

        expect(ids.filter((id) => id === "next-js")).toHaveLength(1);
    });

    test("sorts by category and then by name", () => {
        const matches = detectTechnologies(
            input({
                headers: { server: "nginx", "cf-ray": "8a1b2c3d4e5f-DAC" },
                html: '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>',
                mailExchangers: ["example-com.mail.protection.outlook.com"],
            }),
        );

        expect(matches.map((match) => match.category)).toEqual([
            "server",
            "cdn",
            "analytics",
            "mail",
        ]);
    });

    test("carries the licence URL for open source and null for everything else", () => {
        const matches = detectTechnologies(
            input({ headers: { server: "nginx", "cf-ray": "abc" } }),
        );

        expect(matches.find((match) => match.id === "nginx")?.licenseUrl).toBe(
            "https://spdx.org/licenses/BSD-2-Clause.html",
        );
        expect(matches.find((match) => match.id === "cloudflare")?.licenseUrl).toBeNull();
    });

    test("finds several layers of one stack at once", () => {
        const ids = idsOf(
            input({
                headers: {
                    server: "cloudflare",
                    "cf-ray": "abc",
                    "x-powered-by": "Next.js 15.0.0",
                },
                html: '<div id="__next"></div><script id="__NEXT_DATA__"></script>',
                nameservers: ["kim.ns.cloudflare.com"],
            }),
        );

        expect(ids).toEqual(
            expect.arrayContaining(["cloudflare", "cloudflare-dns", "next-js", "react"]),
        );
    });
});
