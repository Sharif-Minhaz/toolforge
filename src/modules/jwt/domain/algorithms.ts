import {
    JWT_ALGORITHMS,
    type JwtAlgorithm,
    type JwtAlgorithmFamily,
    type JwtKeyFormat,
} from "../types";

export type AlgorithmDescriptor = {
    readonly id: JwtAlgorithm;
    readonly family: JwtAlgorithmFamily;
    readonly keyFormat: JwtKeyFormat;
    /** Hash the signature is built on, as it appears in the JOSE registry. */
    readonly hash: "SHA-256" | "SHA-384" | "SHA-512" | null;
    /** Shortest HMAC key the algorithm accepts, in bytes; `null` for key pairs. */
    readonly minSecretBytes: number | null;
};

/**
 * The JOSE registry entries this tool covers. Names, curves and hashes are
 * data, not copy — they read the same in every locale, so they never enter the
 * message catalogue.
 */
const DESCRIPTORS: Record<JwtAlgorithm, AlgorithmDescriptor> = {
    HS256: {
        id: "HS256",
        family: "hmac",
        keyFormat: "secret",
        hash: "SHA-256",
        minSecretBytes: 32,
    },
    HS384: {
        id: "HS384",
        family: "hmac",
        keyFormat: "secret",
        hash: "SHA-384",
        minSecretBytes: 48,
    },
    HS512: {
        id: "HS512",
        family: "hmac",
        keyFormat: "secret",
        hash: "SHA-512",
        minSecretBytes: 64,
    },
    RS256: { id: "RS256", family: "rsa", keyFormat: "pem", hash: "SHA-256", minSecretBytes: null },
    RS384: { id: "RS384", family: "rsa", keyFormat: "pem", hash: "SHA-384", minSecretBytes: null },
    RS512: { id: "RS512", family: "rsa", keyFormat: "pem", hash: "SHA-512", minSecretBytes: null },
    PS256: {
        id: "PS256",
        family: "rsaPss",
        keyFormat: "pem",
        hash: "SHA-256",
        minSecretBytes: null,
    },
    PS384: {
        id: "PS384",
        family: "rsaPss",
        keyFormat: "pem",
        hash: "SHA-384",
        minSecretBytes: null,
    },
    PS512: {
        id: "PS512",
        family: "rsaPss",
        keyFormat: "pem",
        hash: "SHA-512",
        minSecretBytes: null,
    },
    ES256: {
        id: "ES256",
        family: "ecdsa",
        keyFormat: "pem",
        hash: "SHA-256",
        minSecretBytes: null,
    },
    ES384: {
        id: "ES384",
        family: "ecdsa",
        keyFormat: "pem",
        hash: "SHA-384",
        minSecretBytes: null,
    },
    ES512: {
        id: "ES512",
        family: "ecdsa",
        keyFormat: "pem",
        hash: "SHA-512",
        minSecretBytes: null,
    },
    EdDSA: { id: "EdDSA", family: "eddsa", keyFormat: "pem", hash: null, minSecretBytes: null },
};

export function getAlgorithm(id: JwtAlgorithm): AlgorithmDescriptor {
    return DESCRIPTORS[id];
}

export function isSupportedAlgorithm(value: unknown): value is JwtAlgorithm {
    return typeof value === "string" && JWT_ALGORITHMS.some((id) => id === value);
}

export function getKeyFormat(id: JwtAlgorithm): JwtKeyFormat {
    return DESCRIPTORS[id].keyFormat;
}

/**
 * RFC 7518 §3.2 requires an HMAC key at least as long as the hash it feeds.
 * Shorter secrets still sign and verify — the point is to say so, not to refuse
 * to debug a token someone else already issued that way.
 */
export function isSecretTooShort(id: JwtAlgorithm, byteLength: number): boolean {
    const minimum = DESCRIPTORS[id].minSecretBytes;

    return minimum !== null && byteLength > 0 && byteLength < minimum;
}

/** `alg: none` — the unsigned token JOSE allows and no verifier should accept. */
export function isUnsecuredAlgorithm(value: unknown): boolean {
    return typeof value === "string" && value.toLowerCase() === "none";
}

/**
 * The algorithm to check a decoded token against: whatever the reader chose,
 * falling back to the header's own `alg` only as a starting point. Verification
 * always receives one explicit algorithm, never the header's value implicitly —
 * that substitution is what algorithm-confusion attacks rely on.
 */
export function resolveExpectedAlgorithm(
    override: JwtAlgorithm | null,
    headerAlgorithm: string | null,
    fallback: JwtAlgorithm,
): JwtAlgorithm {
    if (override !== null) {
        return override;
    }

    return isSupportedAlgorithm(headerAlgorithm) ? headerAlgorithm : fallback;
}
