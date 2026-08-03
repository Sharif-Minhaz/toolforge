import type { CertificateReport } from "../types";

/**
 * The TLS peer certificate, reduced to the eleven things a person actually
 * wants to know about it.
 *
 * Pure. The repository opens the socket and hands the plain object over, which
 * is what lets the wildcard matching and the date parsing below be tested
 * against awkward names without a handshake.
 */

/**
 * The distinguished-name fields worth reading. Written as an optional pair
 * rather than a `Record`, because `tls.Certificate` is an interface and an
 * interface has no implicit index signature — a `Record<string, unknown>` here
 * would not accept the very type this exists to describe.
 */
export type CertificateName = {
    readonly CN?: string;
    readonly O?: string;
};

/** The subset of Node's `PeerCertificate` this reads, structurally typed. */
export type PeerCertificateLike = {
    readonly subject?: CertificateName;
    readonly issuer?: CertificateName;
    readonly subjectaltname?: string;
    readonly valid_from?: string;
    readonly valid_to?: string;
    readonly fingerprint256?: string;
    readonly serialNumber?: string;
    readonly bits?: number;
    readonly asn1Curve?: string;
    readonly nistCurve?: string;
    readonly modulus?: string;
    readonly issuerCertificate?: PeerCertificateLike;
};

const MS_PER_DAY = 86_400_000;

/** A self-signed root points at itself; this stops the walk regardless. */
const MAX_CHAIN_DEPTH = 10;

const MONTHS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
] as const;

/**
 * OpenSSL prints `Apr  1 23:59:59 2026 GMT`, with a padding space on
 * single-digit days. It is parsed field by field rather than handed to `Date`,
 * because the shape is not one the ECMAScript grammar requires any engine to
 * accept — and a certificate whose expiry silently becomes `Invalid Date` is
 * worse than one that reports it could not be read.
 */
export function parseOpenSslDate(value: string | undefined): string | null {
    if (value === undefined) {
        return null;
    }

    const matched =
        /^([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s*(GMT|UTC)?$/i.exec(
            value.trim(),
        );

    if (matched === null) {
        return null;
    }

    const month = MONTHS.indexOf(matched[1].toLowerCase() as (typeof MONTHS)[number]);

    if (month < 0) {
        return null;
    }

    const stamp = Date.UTC(
        Number(matched[6]),
        month,
        Number(matched[2]),
        Number(matched[3]),
        Number(matched[4]),
        Number(matched[5]),
    );

    return Number.isNaN(stamp) ? null : new Date(stamp).toISOString();
}

function distinguishedName(fields: CertificateName | undefined): string | null {
    const common = fields?.CN;

    if (typeof common === "string" && common.length > 0) {
        return common;
    }

    const organisation = fields?.O;

    return typeof organisation === "string" && organisation.length > 0 ? organisation : null;
}

function organisation(fields: CertificateName | undefined): string | null {
    const value = fields?.O;

    return typeof value === "string" && value.length > 0 ? value : null;
}

/** `DNS:example.com, DNS:*.example.com, IP Address:1.2.3.4` → the names. */
export function readAltNames(value: string | undefined): readonly string[] {
    if (value === undefined) {
        return [];
    }

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => entry.replace(/^(?:DNS|IP Address|URI|email):/i, "").trim())
        .filter((entry) => entry.length > 0);
}

/**
 * RFC 6125 wildcard matching: `*` stands for exactly one label, only in the
 * leftmost position. `*.example.com` therefore covers `www.example.com` and
 * neither `example.com` nor `a.b.example.com`.
 */
export function certificateCoversHost(hostname: string, names: readonly string[]): boolean {
    const host = hostname.toLowerCase();

    return names.some((raw) => {
        const name = raw.toLowerCase();

        if (name === host) {
            return true;
        }

        if (!name.startsWith("*.")) {
            return false;
        }

        const suffix = name.slice(1);

        return host.endsWith(suffix) && !host.slice(0, -suffix.length).includes(".");
    });
}

function describeKey(certificate: PeerCertificateLike): string | null {
    const curve = certificate.nistCurve ?? certificate.asn1Curve;

    if (typeof curve === "string" && curve.length > 0) {
        return `EC ${curve}`;
    }

    if (typeof certificate.modulus === "string" && typeof certificate.bits === "number") {
        return `RSA ${certificate.bits}`;
    }

    return typeof certificate.bits === "number" ? `${certificate.bits} bit` : null;
}

/** Issuer common names from the leaf upwards, ending at the root it claims. */
export function readChain(certificate: PeerCertificateLike): readonly string[] {
    const chain: string[] = [];

    let current: PeerCertificateLike | undefined = certificate;
    let depth = 0;

    while (current !== undefined && depth < MAX_CHAIN_DEPTH) {
        const issuer = distinguishedName(current.issuer);

        // A self-signed root is its own issuer, and the level below already
        // named it — so without this the chain ends with the root printed twice.
        if (issuer !== null && issuer !== chain.at(-1)) {
            chain.push(issuer);
        }

        const next: PeerCertificateLike | undefined = current.issuerCertificate;

        // Node terminates the chain by pointing the root at itself.
        if (next === undefined || next === current) {
            break;
        }

        current = next;
        depth += 1;
    }

    return chain;
}

export type CertificateInput = {
    readonly certificate: PeerCertificateLike;
    readonly hostname: string;
    readonly protocol: string | null;
    readonly cipher: string | null;
    readonly now: Date;
};

export function toCertificateReport({
    certificate,
    hostname,
    protocol,
    cipher,
    now,
}: CertificateInput): CertificateReport {
    const validTo = parseOpenSslDate(certificate.valid_to);
    const altNames = readAltNames(certificate.subjectaltname);
    const subject = distinguishedName(certificate.subject);

    // A certificate with no SAN extension is judged on its common name, which
    // is what every client did before SANs became mandatory and what a
    // long-lived internal certificate may still rely on.
    const names = altNames.length > 0 ? altNames : subject === null ? [] : [subject];
    const expiryMs = validTo === null ? null : Date.parse(validTo);

    return {
        subject,
        issuer: distinguishedName(certificate.issuer),
        issuerOrg: organisation(certificate.issuer),
        altNames,
        validFrom: parseOpenSslDate(certificate.valid_from),
        validTo,
        daysRemaining:
            expiryMs === null ? null : Math.floor((expiryMs - now.getTime()) / MS_PER_DAY),
        expired: expiryMs !== null && expiryMs < now.getTime(),
        matchesHost: certificateCoversHost(hostname, names),
        serialNumber: certificate.serialNumber ?? null,
        fingerprint: certificate.fingerprint256 ?? null,
        keyType: describeKey(certificate),
        protocol,
        cipher,
        chain: readChain(certificate),
    };
}
