import { describe, expect, test } from "bun:test";

import {
    CERTIFICATE_WARN_DAYS,
    EXPIRY_WARN_DAYS,
    overallTone,
    READING_IDS,
    summarizeReadings,
    type Reading,
    type ReadingId,
} from "@/modules/domain-inspector/domain/summary";
import type { DomainReport } from "@/modules/domain-inspector/types";

const EMPTY: DomainReport = {
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
    dns: { ok: false, reason: "nxdomain" },
    registration: { ok: false, reason: "unsupported_tld" },
    hosting: { ok: false, reason: "no_address" },
    propagation: { ok: false, reason: "no_records" },
    certificate: { ok: false, reason: "skipped" },
    http: { ok: false, reason: "skipped" },
    technologies: { ok: false, reason: "skipped" },
    checkedAt: "2026-08-04T10:15:00.000Z",
};

function withHosting(overrides: Partial<DomainReport> = {}): DomainReport {
    return {
        ...EMPTY,
        hosting: {
            ok: true,
            data: [
                {
                    ip: "93.184.216.34",
                    version: 4,
                    reverse: null,
                    asn: 15133,
                    asName: "EDGECAST, US",
                    prefix: null,
                    country: "US",
                    registry: "arin",
                    network: null,
                    org: null,
                },
                {
                    ip: "2606:2800::1",
                    version: 6,
                    reverse: null,
                    asn: 15133,
                    asName: "EDGECAST, US",
                    prefix: null,
                    country: "US",
                    registry: "arin",
                    network: null,
                    org: null,
                },
            ],
        },
        ...overrides,
    };
}

function reading(report: DomainReport, id: ReadingId): Reading {
    const found = summarizeReadings(report).find((candidate) => candidate.id === id);

    if (found === undefined) {
        throw new Error(`no reading for ${id}`);
    }

    return found;
}

describe("summarizeReadings", () => {
    test("always returns one reading per id, in order", () => {
        expect(summarizeReadings(EMPTY).map((r) => r.id)).toEqual([...READING_IDS]);
    });

    test("reports every panel as idle when nothing answered", () => {
        for (const entry of summarizeReadings(EMPTY)) {
            expect(entry.tone).toBe("idle");
        }
    });

    test("counts addresses and names the first", () => {
        expect(reading(withHosting(), "addresses")).toEqual({
            id: "addresses",
            tone: "good",
            text: "93.184.216.34",
            amount: 2,
            unit: "count",
        });
    });

    test("takes the first address that names an operator", () => {
        expect(reading(withHosting(), "network").text).toBe("EDGECAST, US");
    });

    test("counts zero addresses as idle, not good", () => {
        const none = { ...EMPTY, hosting: { ok: true as const, data: [] } };

        expect(reading(none, "addresses").tone).toBe("idle");
    });
});

describe("expiry tone", () => {
    const withExpiry = (daysUntilExpiry: number | null): DomainReport => ({
        ...EMPTY,
        registration: {
            ok: true,
            data: {
                handle: null,
                registrar: "Example Registrar, Inc.",
                registrarIanaId: null,
                registeredAt: null,
                updatedAt: null,
                expiresAt: "2026-09-01T00:00:00.000Z",
                daysUntilExpiry,
                statuses: [],
                nameservers: [],
                dnssec: false,
                registrantCountry: null,
                abuseEmail: null,
                registrarUrl: null,
                source: null,
            },
        },
    });

    const CASES = [
        [365, "good"],
        [EXPIRY_WARN_DAYS, "good"],
        [EXPIRY_WARN_DAYS - 1, "warn"],
        [0, "warn"],
        [-1, "bad"],
    ] as const;

    for (const [days, tone] of CASES) {
        test(`${days} days is ${tone}`, () => {
            expect(reading(withExpiry(days), "expiry").tone).toBe(tone);
        });
    }

    test("an undisclosed expiry is idle, not bad", () => {
        expect(reading(withExpiry(null), "expiry").tone).toBe("idle");
    });

    test("names the registrar alongside it", () => {
        expect(reading(withExpiry(365), "registrar").text).toBe("Example Registrar, Inc.");
    });
});

describe("certificate tone", () => {
    const withCertificate = (
        daysRemaining: number | null,
        overrides: { expired?: boolean; matchesHost?: boolean } = {},
    ): DomainReport => ({
        ...EMPTY,
        certificate: {
            ok: true,
            data: {
                subject: "example.com",
                issuer: "R11",
                issuerOrg: "Let's Encrypt",
                altNames: [],
                validFrom: null,
                validTo: null,
                daysRemaining,
                expired: overrides.expired ?? false,
                matchesHost: overrides.matchesHost ?? true,
                serialNumber: null,
                fingerprint: null,
                keyType: null,
                protocol: null,
                cipher: null,
                chain: [],
            },
        },
    });

    test("a healthy certificate is good", () => {
        expect(reading(withCertificate(60), "certificate").tone).toBe("good");
    });

    test("warns below the renewal window, not at it", () => {
        // Let's Encrypt renews at 30 days by design, so warning there would
        // report every healthy site on the 90-day cycle as a problem.
        expect(reading(withCertificate(CERTIFICATE_WARN_DAYS), "certificate").tone).toBe("good");
        expect(reading(withCertificate(CERTIFICATE_WARN_DAYS - 1), "certificate").tone).toBe(
            "warn",
        );
    });

    test("an expired certificate is bad", () => {
        expect(reading(withCertificate(-2, { expired: true }), "certificate").tone).toBe("bad");
    });

    test("a certificate for another name is bad however long it lasts", () => {
        expect(reading(withCertificate(300, { matchesHost: false }), "certificate").tone).toBe(
            "bad",
        );
    });
});

describe("header grade", () => {
    const withGrade = (grade: "strong" | "partial" | "weak"): DomainReport => ({
        ...EMPTY,
        http: {
            ok: true,
            data: {
                finalUrl: "https://example.com/",
                status: 200,
                hops: [],
                server: null,
                poweredBy: null,
                contentType: null,
                securityHeaders: [],
                grade,
                title: null,
                declaredLicense: null,
            },
        },
    });

    test("carries the grade through as a key the UI can translate", () => {
        expect(reading(withGrade("partial"), "headers")).toMatchObject({
            text: "partial",
            tone: "warn",
        });
    });

    test("maps each grade to a tone", () => {
        expect(reading(withGrade("strong"), "headers").tone).toBe("good");
        expect(reading(withGrade("weak"), "headers").tone).toBe("bad");
    });
});

describe("overallTone", () => {
    const of = (...tones: readonly Reading["tone"][]): readonly Reading[] =>
        tones.map((tone, index) => ({
            id: READING_IDS[index],
            tone,
            text: null,
            amount: null,
            unit: null,
        }));

    test("the worst tone wins", () => {
        expect(overallTone(of("good", "warn", "bad"))).toBe("bad");
        expect(overallTone(of("good", "warn", "good"))).toBe("warn");
        expect(overallTone(of("good", "good"))).toBe("good");
    });

    test("a panel that could not answer is not a finding", () => {
        expect(overallTone(of("idle", "good", "idle"))).toBe("good");
        expect(overallTone(of("idle", "idle"))).toBe("idle");
    });

    test("an empty strip is idle", () => {
        expect(overallTone([])).toBe("idle");
    });
});
