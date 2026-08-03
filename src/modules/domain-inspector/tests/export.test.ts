import { describe, expect, test } from "bun:test";

import {
    buildReportFilename,
    createDomainReportFile,
    summarizeReport,
} from "@/modules/domain-inspector/domain/export";
import type { DomainReport } from "@/modules/domain-inspector/types";

const REPORT: DomainReport = {
    breakdown: {
        hostname: "example.com",
        unicode: "example.com",
        labels: ["example", "com"],
        subdomain: null,
        registrableDomain: "example.com",
        publicSuffix: "com",
        isIcannSuffix: true,
        isIp: false,
        punycoded: false,
    },
    dns: {
        ok: true,
        data: {
            resolver: "cloudflare",
            authenticated: true,
            sets: [
                {
                    type: "A",
                    records: [{ name: "example.com", ttl: 300, value: "93.184.216.34" }],
                },
                { type: "MX", records: [] },
            ],
            mail: { spf: "v=spf1 -all", dmarc: null, mtaSts: false },
        },
    },
    registration: {
        ok: true,
        data: {
            handle: "H1",
            registrar: "Example Registrar, Inc.",
            registrarIanaId: "376",
            registeredAt: "1995-08-14T04:00:00.000Z",
            updatedAt: null,
            expiresAt: "2026-08-14T04:00:00.000Z",
            daysUntilExpiry: 10,
            statuses: ["client transfer prohibited"],
            nameservers: ["a.iana-servers.net"],
            dnssec: true,
            registrantCountry: null,
            abuseEmail: null,
            registrarUrl: null,
            source: "rdap.verisign.com",
        },
    },
    hosting: {
        ok: true,
        data: [
            {
                ip: "93.184.216.34",
                version: 4,
                reverse: null,
                asn: 15133,
                asName: "EDGECAST, US",
                prefix: "93.184.216.0/24",
                country: "US",
                registry: "arin",
                network: "EDGECAST-NETBLK",
                org: "Edgecast Inc.",
            },
        ],
    },
    certificate: { ok: false, reason: "tls_failed" },
    http: { ok: false, reason: "http_failed" },
    technologies: {
        ok: true,
        data: [
            {
                id: "nginx",
                name: "nginx",
                category: "server",
                license: "BSD-2-Clause",
                licenseUrl: "https://spdx.org/licenses/BSD-2-Clause.html",
                version: "1.27.4",
                evidence: { source: "header", key: "server" },
            },
        ],
    },
    checkedAt: "2026-08-04T10:15:00.000Z",
};

describe("buildReportFilename", () => {
    test("names the subject and sorts by time", () => {
        expect(buildReportFilename("example.com", new Date("2026-08-04T10:15:00.000Z"))).toBe(
            "example.com-20260804T101500Z.json",
        );
    });

    test("keeps a hostname out of the filesystem's way", () => {
        expect(buildReportFilename("a/b\\c.com", new Date("2026-08-04T10:15:00.000Z"))).toBe(
            "a-b-c.com-20260804T101500Z.json",
        );
    });

    test("falls back to a name rather than producing a bare timestamp", () => {
        expect(buildReportFilename("///", new Date("2026-08-04T10:15:00.000Z"))).toStartWith(
            "domain-",
        );
    });
});

describe("createDomainReportFile", () => {
    const file = createDomainReportFile(REPORT);

    test("is JSON, named after the domain", () => {
        expect(file.mimeType).toBe("application/json;charset=utf-8");
        expect(file.filename).toBe("example.com-20260804T101500Z.json");
    });

    test("round-trips through JSON.parse", () => {
        expect(() => JSON.parse(file.content)).not.toThrow();
    });

    test("keeps a failed panel and says why it failed", () => {
        // Dropping it would make a site with no certificate indistinguishable
        // from a lookup that could not reach one.
        const parsed = JSON.parse(file.content);

        expect(parsed.certificate).toEqual({ unavailable: "tls_failed" });
        expect(parsed.http).toEqual({ unavailable: "http_failed" });
    });

    test("carries the panels that succeeded in full", () => {
        const parsed = JSON.parse(file.content);

        expect(parsed.domain.hostname).toBe("example.com");
        expect(parsed.registration.registrar).toBe("Example Registrar, Inc.");
        expect(parsed.hosting[0].asn).toBe(15133);
        expect(parsed.technologies[0].license).toBe("BSD-2-Clause");
    });

    test("ends with a newline", () => {
        expect(file.content).toEndWith("\n");
    });
});

describe("summarizeReport", () => {
    const summary = summarizeReport(REPORT);

    test("leads with the hostname", () => {
        expect(summary.split("\n")[0]).toBe("example.com");
    });

    test("names the address, the registrar, the network and the stack", () => {
        expect(summary).toContain("93.184.216.34");
        expect(summary).toContain("Example Registrar, Inc.");
        expect(summary).toContain("EDGECAST, US");
        expect(summary).toContain("nginx");
    });

    test("says nothing about a panel that failed", () => {
        expect(summary).not.toContain("Certificate:");
    });

    test("degrades to the hostname alone when nothing resolved", () => {
        const empty = summarizeReport({
            ...REPORT,
            dns: { ok: false, reason: "nxdomain" },
            registration: { ok: false, reason: "unsupported_tld" },
            hosting: { ok: false, reason: "no_address" },
            technologies: { ok: false, reason: "http_failed" },
        });

        expect(empty).toBe("example.com");
    });
});
