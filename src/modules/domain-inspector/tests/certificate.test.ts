import { describe, expect, test } from "bun:test";

import {
    certificateCoversHost,
    parseOpenSslDate,
    readAltNames,
    readChain,
    toCertificateReport,
    type PeerCertificateLike,
} from "@/modules/domain-inspector/domain/certificate";

const NOW = new Date("2026-08-04T00:00:00.000Z");

const LEAF: PeerCertificateLike = {
    subject: { CN: "example.com" },
    issuer: { CN: "R11", O: "Let's Encrypt", C: "US" },
    subjectaltname: "DNS:example.com, DNS:*.example.com",
    valid_from: "Jul  6 09:12:00 2026 GMT",
    valid_to: "Oct  4 09:11:59 2026 GMT",
    fingerprint256: "AA:BB:CC",
    serialNumber: "03A1B2",
    bits: 256,
    nistCurve: "P-256",
    issuerCertificate: {
        subject: { CN: "R11" },
        issuer: { CN: "ISRG Root X1", O: "Internet Security Research Group" },
    },
};

describe("parseOpenSslDate", () => {
    test("reads the padded single-digit day OpenSSL prints", () => {
        expect(parseOpenSslDate("Apr  1 23:59:59 2026 GMT")).toBe("2026-04-01T23:59:59.000Z");
    });

    test("reads a two-digit day", () => {
        expect(parseOpenSslDate("Dec 31 00:00:00 2027 GMT")).toBe("2027-12-31T00:00:00.000Z");
    });

    test("accepts the UTC spelling and a missing suffix", () => {
        expect(parseOpenSslDate("Jan  5 06:00:00 2026 UTC")).toBe("2026-01-05T06:00:00.000Z");
        expect(parseOpenSslDate("Jan  5 06:00:00 2026")).toBe("2026-01-05T06:00:00.000Z");
    });

    test("returns null rather than an Invalid Date", () => {
        expect(parseOpenSslDate("Smarch 1 00:00:00 2026 GMT")).toBeNull();
        expect(parseOpenSslDate("2026-04-01")).toBeNull();
        expect(parseOpenSslDate(undefined)).toBeNull();
    });
});

describe("readAltNames", () => {
    test("strips the type prefixes OpenSSL puts on each name", () => {
        expect(readAltNames("DNS:example.com, DNS:*.example.com, IP Address:1.2.3.4")).toEqual([
            "example.com",
            "*.example.com",
            "1.2.3.4",
        ]);
    });

    test("returns nothing for a certificate with no SAN extension", () => {
        expect(readAltNames(undefined)).toEqual([]);
    });
});

describe("certificateCoversHost", () => {
    const CASES: readonly (readonly [string, readonly string[], boolean])[] = [
        ["example.com", ["example.com"], true],
        ["EXAMPLE.com", ["example.com"], true],
        ["www.example.com", ["*.example.com"], true],
        // A wildcard stands for exactly one label, and never for none.
        ["example.com", ["*.example.com"], false],
        ["a.b.example.com", ["*.example.com"], false],
        ["a.b.example.com", ["*.b.example.com"], true],
        ["evil-example.com", ["*.example.com"], false],
        ["example.com", [], false],
    ];

    for (const [hostname, names, expected] of CASES) {
        test(`${hostname} against ${JSON.stringify(names)} is ${expected}`, () => {
            expect(certificateCoversHost(hostname, names)).toBe(expected);
        });
    }
});

describe("readChain", () => {
    test("walks issuer common names upward", () => {
        expect(readChain(LEAF)).toEqual(["R11", "ISRG Root X1"]);
    });

    test("names a self-signed root once, not twice", () => {
        // Node terminates the chain by pointing the root at itself, so the root's
        // own issuer is the name the level below already contributed.
        const root: PeerCertificateLike = { subject: { CN: "Self" }, issuer: { CN: "Self" } };
        const selfSigned: PeerCertificateLike = { ...root, issuerCertificate: root };

        expect(readChain(selfSigned)).toEqual(["Self"]);
    });

    test("keeps a genuine repeat that is not consecutive", () => {
        const chain: PeerCertificateLike = {
            issuer: { CN: "A" },
            issuerCertificate: { issuer: { CN: "B" }, issuerCertificate: { issuer: { CN: "A" } } },
        };

        expect(readChain(chain)).toEqual(["A", "B", "A"]);
    });
});

describe("toCertificateReport", () => {
    const report = toCertificateReport({
        certificate: LEAF,
        hostname: "www.example.com",
        protocol: "TLSv1.3",
        cipher: "TLS_AES_128_GCM_SHA256",
        now: NOW,
    });

    test("reads the identity fields", () => {
        expect(report).toMatchObject({
            subject: "example.com",
            issuer: "R11",
            issuerOrg: "Let's Encrypt",
            serialNumber: "03A1B2",
            fingerprint: "AA:BB:CC",
            protocol: "TLSv1.3",
            cipher: "TLS_AES_128_GCM_SHA256",
        });
    });

    test("counts the days left and does not call it expired", () => {
        expect(report.daysRemaining).toBe(61);
        expect(report.expired).toBe(false);
    });

    test("matches the wildcard SAN against the host that was asked for", () => {
        expect(report.matchesHost).toBe(true);
    });

    test("names an elliptic-curve key by its curve", () => {
        expect(report.keyType).toBe("EC P-256");
    });

    test("names an RSA key by its modulus size", () => {
        const rsa = toCertificateReport({
            certificate: { ...LEAF, nistCurve: undefined, modulus: "00AB", bits: 2048 },
            hostname: "example.com",
            protocol: null,
            cipher: null,
            now: NOW,
        });

        expect(rsa.keyType).toBe("RSA 2048");
    });

    test("reports an expired certificate as expired", () => {
        const expired = toCertificateReport({
            certificate: LEAF,
            hostname: "example.com",
            protocol: null,
            cipher: null,
            now: new Date("2027-01-01T00:00:00.000Z"),
        });

        expect(expired.expired).toBe(true);
        expect(expired.daysRemaining).toBeLessThan(0);
    });

    test("falls back to the common name when there is no SAN extension", () => {
        const legacy = toCertificateReport({
            certificate: { subject: { CN: "legacy.example" }, issuer: { CN: "Old CA" } },
            hostname: "legacy.example",
            protocol: null,
            cipher: null,
            now: NOW,
        });

        expect(legacy.matchesHost).toBe(true);
        expect(legacy.altNames).toEqual([]);
    });

    test("says a certificate does not cover a host it was not issued for", () => {
        const mismatched = toCertificateReport({
            certificate: LEAF,
            hostname: "somewhere-else.test",
            protocol: null,
            cipher: null,
            now: NOW,
        });

        expect(mismatched.matchesHost).toBe(false);
    });

    test("survives a certificate with no dates at all", () => {
        const bare = toCertificateReport({
            certificate: {},
            hostname: "example.com",
            protocol: null,
            cipher: null,
            now: NOW,
        });

        expect(bare).toMatchObject({
            validFrom: null,
            validTo: null,
            daysRemaining: null,
            expired: false,
        });
    });
});
