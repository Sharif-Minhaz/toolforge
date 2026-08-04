/**
 * The shapes every panel of the Domain Inspector speaks.
 *
 * Everything here is serialisable: the whole report crosses a Server Action
 * boundary, so dates are ISO strings rather than `Date` objects and nothing
 * holds a socket, a response, or a function.
 */

/** Public resolvers the reader can choose between, all of which speak DoH JSON. */
export const DNS_RESOLVERS = ["cloudflare", "google", "dnssb"] as const;

export type DnsResolver = (typeof DNS_RESOLVERS)[number];

/**
 * The record types worth asking for on an apex name. `SRV` is deliberately
 * absent: it is only ever published under a `_service._proto` prefix, so a
 * query at the apex returns nothing and reads as "this domain has no SRV
 * records" rather than "you asked the wrong name".
 */
export const DNS_RECORD_TYPES = [
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "NS",
    "TXT",
    "SOA",
    "CAA",
    "DS",
] as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export type DnsRecord = {
    readonly name: string;
    readonly ttl: number;
    /** Already unquoted and joined for TXT; presentation format for the rest. */
    readonly value: string;
    /** MX preference, kept apart so the UI can sort and right-align it. */
    readonly priority?: number;
};

export type DnsAnswerSet = {
    readonly type: DnsRecordType;
    readonly records: readonly DnsRecord[];
};

/** What the apex publishes about who may send mail as it. */
export type MailPosture = {
    readonly spf: string | null;
    readonly dmarc: string | null;
    readonly mtaSts: boolean;
};

export type DnsReport = {
    readonly resolver: DnsResolver;
    /**
     * The resolver's `AD` bit — it validated DNSSEC for this answer. Absence
     * means "unsigned or not validated", never "forged".
     */
    readonly authenticated: boolean;
    readonly sets: readonly DnsAnswerSet[];
    readonly mail: MailPosture;
};

/** How the input decomposes against the Public Suffix List. */
export type DomainBreakdown = {
    /** ASCII / punycode form — what every lookup below is actually keyed on. */
    readonly hostname: string;
    /** Unicode form, for display. Equal to `hostname` for an ASCII name. */
    readonly unicode: string;
    readonly labels: readonly string[];
    readonly subdomain: string | null;
    readonly registrableDomain: string | null;
    readonly publicSuffix: string | null;
    /** The suffix is in the ICANN section of the list, not the private one. */
    readonly isIcannSuffix: boolean;
    readonly isIp: boolean;
    /** The ASCII and Unicode forms differ, so the reader typed an IDN. */
    readonly punycoded: boolean;
};

export type DomainRegistration = {
    readonly handle: string | null;
    readonly registrar: string | null;
    readonly registrarIanaId: string | null;
    readonly registeredAt: string | null;
    readonly updatedAt: string | null;
    readonly expiresAt: string | null;
    /** Days until `expiresAt`, negative once past. `null` when undisclosed. */
    readonly daysUntilExpiry: number | null;
    /** EPP status codes such as `clientTransferProhibited`. Proper names, not copy. */
    readonly statuses: readonly string[];
    readonly nameservers: readonly string[];
    readonly dnssec: boolean;
    readonly registrantCountry: string | null;
    readonly abuseEmail: string | null;
    readonly registrarUrl: string | null;
    /** Host of the RDAP server that answered, so the reader can check it. */
    readonly source: string | null;
};

export type IpVersion = 4 | 6;

export type HostAddress = {
    readonly ip: string;
    readonly version: IpVersion;
    readonly reverse: string | null;
    readonly asn: number | null;
    readonly asName: string | null;
    readonly prefix: string | null;
    /** ISO 3166-1 alpha-2, from the routing registry rather than a geo-IP guess. */
    readonly country: string | null;
    readonly registry: string | null;
    readonly network: string | null;
    readonly org: string | null;
};

/**
 * What one resolver said when asked the same question as all the others.
 *
 * `agreed` and `differs` are the two answers worth having; the other two are
 * the ways a node can fail to give one, kept apart because "this resolver has
 * not caught up" and "this resolver did not reply" are different findings.
 */
export const PROPAGATION_STATES = ["agreed", "differs", "empty", "unreachable"] as const;

export type PropagationState = (typeof PROPAGATION_STATES)[number];

/** A resolver in the propagation fan-out, and what it answered. */
export type PropagationNodeResult = {
    readonly id: string;
    /** The operator's own name — a proper noun, never translated. */
    readonly name: string;
    /** ISO 3166-1 alpha-2 for where the operator runs the service. */
    readonly country: string;
    /**
     * The service answers from whichever node is nearest the caller, so its
     * reply describes this server's corner of the internet rather than the
     * country on the map. Surfaced, not hidden — see the panel copy.
     */
    readonly anycast: boolean;
    readonly state: PropagationState;
    /** Addresses returned, sorted, so two nodes are compared by value not order. */
    readonly values: readonly string[];
    readonly ttl: number | null;
    readonly elapsedMs: number;
};

export type PropagationReport = {
    /** Which record type was compared — `AAAA` only when there is no `A` at all. */
    readonly type: Extract<DnsRecordType, "A" | "AAAA">;
    /** The answer the most resolvers gave; empty when none of them answered. */
    readonly consensus: readonly string[];
    readonly agreed: number;
    readonly answered: number;
    readonly total: number;
    readonly nodes: readonly PropagationNodeResult[];
};

export type CertificateReport = {
    readonly subject: string | null;
    readonly issuer: string | null;
    readonly issuerOrg: string | null;
    readonly altNames: readonly string[];
    readonly validFrom: string | null;
    readonly validTo: string | null;
    readonly daysRemaining: number | null;
    readonly expired: boolean;
    /** The presented certificate actually covers the name that was asked for. */
    readonly matchesHost: boolean;
    readonly serialNumber: string | null;
    readonly fingerprint: string | null;
    readonly keyType: string | null;
    readonly protocol: string | null;
    readonly cipher: string | null;
    readonly chain: readonly string[];
};

export const SECURITY_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
] as const;

export type SecurityHeaderName = (typeof SECURITY_HEADERS)[number];

export type SecurityHeader = {
    readonly name: SecurityHeaderName;
    readonly value: string | null;
};

export const SECURITY_GRADES = ["strong", "partial", "weak"] as const;

export type SecurityGrade = (typeof SECURITY_GRADES)[number];

export type HttpHop = {
    readonly url: string;
    readonly status: number;
    readonly location: string | null;
};

/** A `<link rel="license">` or `<meta name="license">` the page declares itself. */
export type PageLicense = {
    readonly name: string | null;
    readonly url: string | null;
};

export type HttpReport = {
    readonly finalUrl: string;
    readonly status: number;
    readonly hops: readonly HttpHop[];
    readonly server: string | null;
    readonly poweredBy: string | null;
    readonly contentType: string | null;
    readonly securityHeaders: readonly SecurityHeader[];
    readonly grade: SecurityGrade;
    readonly title: string | null;
    readonly declaredLicense: PageLicense | null;
};

export const TECHNOLOGY_CATEGORIES = [
    "server",
    "cdn",
    "hosting",
    "dns",
    "cms",
    "framework",
    "ecommerce",
    "javascript",
    "analytics",
    "security",
    "mail",
] as const;

export type TechnologyCategory = (typeof TECHNOLOGY_CATEGORIES)[number];

/** Where a signature looked. A literal union, so its labels are translatable. */
export const EVIDENCE_SOURCES = ["header", "cookie", "html", "generator", "mx", "ns"] as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** Which header, cookie, or record carried the proof. `key` is `null` for markup. */
export type TechnologyEvidence = {
    readonly source: EvidenceSource;
    readonly key: string | null;
};

/**
 * One detected technology and the licence it ships under.
 *
 * `license` is an SPDX identifier where one applies and the literal
 * `"Proprietary"` where none does — both are proper names, so neither is
 * translated. `evidence` names what matched, so a detection can be argued with
 * rather than merely believed.
 */
export type TechnologyMatch = {
    readonly id: string;
    readonly name: string;
    readonly category: TechnologyCategory;
    readonly license: string;
    readonly licenseUrl: string | null;
    readonly version: string | null;
    readonly evidence: TechnologyEvidence;
};

/** Where a single panel's lookup can stop short without failing the report. */
export type PanelFailureReason =
    /** The reader turned the site fetch off — nothing was attempted. */
    | "skipped"
    | "timeout"
    | "network_error"
    | "nxdomain"
    | "no_records"
    | "unsupported_tld"
    | "unreadable_response"
    | "no_address"
    | "blocked_address"
    | "tls_failed"
    | "http_failed";

export type PanelResult<T> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly reason: PanelFailureReason };

export type DomainReport = {
    readonly breakdown: DomainBreakdown;
    readonly dns: PanelResult<DnsReport>;
    readonly registration: PanelResult<DomainRegistration>;
    readonly hosting: PanelResult<readonly HostAddress[]>;
    readonly propagation: PanelResult<PropagationReport>;
    readonly certificate: PanelResult<CertificateReport>;
    readonly http: PanelResult<HttpReport>;
    readonly technologies: PanelResult<readonly TechnologyMatch[]>;
    readonly checkedAt: string;
};

/**
 * How the whole request can be refused before any lookup is attempted. The
 * middle three come from the shared Turnstile verifier, so they are spelled the
 * way it spells them rather than renamed on the way through.
 */
export type InspectionFailureReason =
    | "empty_input"
    | "too_long"
    | "invalid_hostname"
    | "unknown_suffix"
    | "private_address"
    | "challenge_failed"
    | "not_configured"
    | "upstream_unavailable"
    | "lookup_failed";

export type InspectionResult =
    | { readonly ok: true; readonly report: DomainReport }
    | { readonly ok: false; readonly reason: InspectionFailureReason };

/** Everything the reader can turn before pressing the button. */
export type InspectionOptions = {
    readonly resolver: DnsResolver;
    /** Skip the TLS handshake and the page fetch — DNS and WHOIS only. */
    readonly probeSite: boolean;
};
