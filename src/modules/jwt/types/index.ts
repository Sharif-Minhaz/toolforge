export const JWT_MODES = ["decode", "encode"] as const;

export type JwtMode = (typeof JWT_MODES)[number];

/**
 * Signing algorithms the tool can produce or check. `none` is deliberately
 * absent: the decoder recognises it so it can warn, but nothing here mints an
 * unsigned token.
 */
export const JWT_ALGORITHMS = [
    "HS256",
    "HS384",
    "HS512",
    "RS256",
    "RS384",
    "RS512",
    "PS256",
    "PS384",
    "PS512",
    "ES256",
    "ES384",
    "ES512",
    "EdDSA",
] as const;

export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

export type JwtAlgorithmFamily = "hmac" | "rsa" | "rsaPss" | "ecdsa" | "eddsa";

/** What the key box expects: a shared secret, or a PEM block. */
export type JwtKeyFormat = "secret" | "pem";

/** Key material as typed into the workbench, before any import is attempted. */
export type JwtKeyInput =
    | {
          readonly kind: "secret";
          readonly secret: string;
          /** The secret is base64url text to be decoded to bytes, not UTF-8. */
          readonly base64url: boolean;
      }
    | { readonly kind: "pem"; readonly pem: string };

/* ---------------------------------------------------------------- decode --- */

export type JwtSegmentName = "header" | "payload" | "signature";

export type JwtDecodeFailureReason =
    | "empty"
    | "segment_count"
    | "encrypted_token"
    | "invalid_base64"
    | "invalid_json"
    | "not_an_object"
    | "too_large";

export type JwtDecodeFailure = {
    readonly ok: false;
    readonly reason: JwtDecodeFailureReason;
    /** Which of the three parts the failure came from, when it is attributable. */
    readonly segment?: JwtSegmentName;
    /** Number of dot-separated parts actually found, for `segment_count`. */
    readonly segmentCount?: number;
};

/** Header and payload are free-form JSON objects; nothing is guaranteed present. */
export type JwtClaims = Readonly<Record<string, unknown>>;

export type JwtSegments = {
    readonly header: string;
    readonly payload: string;
    readonly signature: string;
};

export type DecodedJwt = {
    readonly ok: true;
    /** The token with surrounding whitespace and any `Bearer ` prefix removed. */
    readonly token: string;
    readonly segments: JwtSegments;
    readonly header: JwtClaims;
    readonly payload: JwtClaims;
    /** Re-indented for display; the signature always covers the original bytes. */
    readonly headerJson: string;
    readonly payloadJson: string;
    /** `alg` as written in the header, or `null` when absent or not a string. */
    readonly algorithm: string | null;
};

export type JwtDecodeResult = DecodedJwt | JwtDecodeFailure;

/* ---------------------------------------------------------------- claims --- */

export const TIME_CLAIMS = ["exp", "nbf", "iat"] as const;

export type TimeClaim = (typeof TIME_CLAIMS)[number];

export const REGISTERED_CLAIMS = ["iss", "sub", "aud", "exp", "nbf", "iat", "jti"] as const;

export type RegisteredClaim = (typeof REGISTERED_CLAIMS)[number];

/** JOSE header parameters the breakdown can explain, from RFC 7515 §4.1. */
export const HEADER_PARAMETERS = [
    "alg",
    "typ",
    "cty",
    "kid",
    "jku",
    "jwk",
    "x5u",
    "x5c",
    "x5t",
    "crit",
] as const;

export type HeaderParameter = (typeof HEADER_PARAMETERS)[number];

export type HeaderRow = {
    readonly name: string;
    readonly value: unknown;
    /** Set when the name is a documented parameter, so the UI can describe it. */
    readonly parameter: HeaderParameter | null;
};

export type PayloadRow = {
    readonly name: string;
    readonly value: unknown;
    readonly claim: RegisteredClaim | null;
    /** Present for `exp`, `nbf` and `iat`, carrying their standing right now. */
    readonly time: TimeClaimInsight | null;
};

/**
 * How a time claim stands relative to the reference instant. `stale` is an
 * `iat` older than the long-lived threshold, not a failure on its own.
 */
export type TimeClaimState = "valid" | "expired" | "notYetValid" | "future" | "stale" | "malformed";

export type TimeClaimInsight = {
    readonly claim: TimeClaim;
    /** The raw claim value, kept even when it is not a usable number. */
    readonly value: unknown;
    /** `null` when the value is not a finite number of seconds. */
    readonly at: Date | null;
    readonly state: TimeClaimState;
    /** Signed seconds from the reference instant to the claim; negative is past. */
    readonly offsetSeconds: number;
};

/* -------------------------------------------------------------- security --- */

export const JWT_FINDING_CODES = [
    "algNone",
    "algMissing",
    "expired",
    "notYetValid",
    "missingExp",
    "longLived",
    "remoteKeyHeader",
    "nestedToken",
    "sensitiveClaim",
] as const;

export type JwtFindingCode = (typeof JWT_FINDING_CODES)[number];

export type JwtFindingSeverity = "critical" | "warning" | "info";

export type JwtFinding = {
    readonly code: JwtFindingCode;
    readonly severity: JwtFindingSeverity;
    /** Claim or header parameter names the message points at. */
    readonly subjects: readonly string[];
};

/* ----------------------------------------------------------------- keys ---- */

export type PemKind = "spki" | "pkcs8" | "x509" | "pkcs1" | "unknown";

export type JwtKeyFailureReason =
    "no_key" | "invalid_key" | "expected_public_key" | "expected_private_key" | "unsupported_pem";

export type JwtKeyFailure = { readonly ok: false; readonly reason: JwtKeyFailureReason };

/* --------------------------------------------------------------- verify ---- */

export type JwtVerifyFailureReason =
    | JwtKeyFailureReason
    | "malformed_token"
    | "algorithm_mismatch"
    | "unsupported_algorithm"
    | "signature_mismatch";

export type JwtVerifyResult =
    | { readonly ok: true; readonly algorithm: JwtAlgorithm }
    | { readonly ok: false; readonly reason: JwtVerifyFailureReason };

/* ----------------------------------------------------------------- sign ---- */

export type JwtSignFailureReason =
    | JwtKeyFailureReason
    | "invalid_header_json"
    | "invalid_payload_json"
    | "header_not_object"
    | "payload_not_object"
    | "algorithm_missing"
    | "unsupported_algorithm"
    | "too_large"
    | "signing_failed";

export type JwtSignResult =
    | { readonly ok: true; readonly token: string }
    | { readonly ok: false; readonly reason: JwtSignFailureReason };

/* ---------------------------------------------------------------- export --- */

export type JwtExportRequest = {
    readonly mode: JwtMode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
