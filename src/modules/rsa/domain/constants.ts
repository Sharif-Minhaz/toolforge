import type {
    RsaHash,
    RsaKeyFormat,
    RsaKeySize,
    RsaOptions,
    RsaOutputFormat,
    RsaUsage,
} from "../types";

/**
 * Two thousand forty-eight bits, which is the floor every current guideline
 * agrees on and what almost every certificate authority and JWT issuer uses.
 */
export const DEFAULT_RSA_KEY_SIZE: RsaKeySize = 2048;

/** The signature scheme in the overwhelming majority of deployed systems. */
export const DEFAULT_RSA_USAGE: RsaUsage = "pkcs1v15";

export const DEFAULT_RSA_HASH: RsaHash = "SHA-256";

export const DEFAULT_RSA_KEY_FORMAT: RsaKeyFormat = "pkcs8";

export const DEFAULT_RSA_OUTPUT_FORMAT: RsaOutputFormat = "pem";

/**
 * F4, the fourth Fermat number: 65537, or 0x10001.
 *
 * It is the default everywhere for two reasons at once — it is prime, and its
 * binary form is `10000000000000001`, so modular exponentiation by it costs
 * seventeen squarings and one multiplication rather than a full ladder.
 */
export const DEFAULT_PUBLIC_EXPONENT = 65_537;

/**
 * The smallest exponent RFC 8017 permits. Legal, still in use, and narrower
 * than it looks: a public exponent of 3 has broken real deployments whose
 * padding checks were sloppy, so the workbench warns rather than refuses.
 */
export const MIN_PUBLIC_EXPONENT = 3;

/**
 * Web Crypto hands the exponent to the engine as a big-endian byte string, and
 * every engine here reads at most four bytes of it. A larger value is refused
 * with its own name instead of failing somewhere inside `generateKey`.
 */
export const MAX_PUBLIC_EXPONENT = 4_294_967_295;

/** 4294967295 is ten digits, and this is a short identity field, so it caps. */
export const MAX_PUBLIC_EXPONENT_LENGTH = 10;

/**
 * The two values every browser will actually mint a key for. Chrome and Firefox
 * both reject anything else outright; Bun and Node accept any odd integer, which
 * is exactly the sort of disagreement that has to be a typed refusal rather than
 * a filtered option list — see `unsupported_exponent`.
 */
export const PORTABLE_PUBLIC_EXPONENTS = [3, DEFAULT_PUBLIC_EXPONENT] as const;

/**
 * Below this the modulus is under every current guideline. NIST SP 800-131A
 * disallowed 1024-bit RSA for signature generation in 2013, and the CA/Browser
 * Forum has not issued from one since 2014.
 */
export const WEAK_KEY_SIZE_CEILING = 1024;

/**
 * Past this a generation takes long enough on a phone that the button has to
 * say so before it is pressed rather than after. Key generation searches for
 * primes, so the cost climbs far faster than the bit count does.
 */
export const SLOW_KEY_SIZE_FLOOR = 4096;

/** PEM bodies wrap at 64 base64 characters, per RFC 7468. */
export const PEM_LINE_LENGTH = 64;

/** Web Crypto algorithm names, which are proper names and never translated. */
export const RSA_ALGORITHM_NAMES: Record<RsaUsage, string> = {
    pkcs1v15: "RSASSA-PKCS1-v1_5",
    pss: "RSA-PSS",
    oaep: "RSA-OAEP",
};

/** Likewise the container names shown in the two format pickers. */
export const KEY_FORMAT_LABELS: Record<RsaKeyFormat, string> = {
    pkcs8: "PKCS#8",
    pkcs1: "PKCS#1",
};

export const OUTPUT_FORMAT_LABELS: Record<RsaOutputFormat, string> = {
    pem: "PEM",
    der: "DER (Base64)",
    jwk: "JWK",
};

export const DEFAULT_RSA_OPTIONS: RsaOptions = {
    keySize: DEFAULT_RSA_KEY_SIZE,
    usage: DEFAULT_RSA_USAGE,
    hash: DEFAULT_RSA_HASH,
    keyFormat: DEFAULT_RSA_KEY_FORMAT,
    outputFormat: DEFAULT_RSA_OUTPUT_FORMAT,
    publicExponent: String(DEFAULT_PUBLIC_EXPONENT),
};
