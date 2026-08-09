import type { PayloadBinaryEncoding, PayloadTextEncoding, RsaKeyKind } from "@/modules/tools/types";
import type {
    RsaCryptDirection,
    RsaCryptHash,
    RsaCryptOptions,
    RsaKeyInputFormat,
    RsaPadding,
} from "../types";

export const DEFAULT_RSA_CRYPT_DIRECTION: RsaCryptDirection = "encrypt";

export const DEFAULT_KEY_INPUT_FORMAT: RsaKeyInputFormat = "pem";

export const DEFAULT_KEY_KIND: RsaKeyKind = "public";

export const DEFAULT_RSA_PADDING: RsaPadding = "oaep";

export const DEFAULT_RSA_CRYPT_HASH: RsaCryptHash = "SHA-256";

export const DEFAULT_TEXT_ENCODING: PayloadTextEncoding = "utf-8";

export const DEFAULT_CIPHER_ENCODING: PayloadBinaryEncoding = "base64";

/**
 * Digest widths in bytes, which is the only thing OAEP's ceiling needs from the
 * hash. Written out rather than derived from the name, so a fourth digest is a
 * compile-time decision instead of a string parsed at runtime.
 */
export const HASH_BYTES: Record<RsaCryptHash, number> = {
    "SHA-256": 32,
    "SHA-384": 48,
    "SHA-512": 64,
};

/**
 * Ceiling on the key box. A 4096-bit PKCS#8 private key in PEM is about 3.2 KB
 * and a JWK of the same key about 3.5 KB, so this is generous by a wide margin
 * and exists to stop a pasted novel from being parsed rather than to bound a
 * key. Refused rather than truncated: silently dropping the tail of a key would
 * produce a parse failure that blamed the wrong thing.
 */
export const MAX_RSA_KEY_LENGTH = 16_384;

/**
 * Ceiling on the payload box.
 *
 * Far above anything RSA can actually encrypt — the real limit is
 * `maxOaepMessageBytes`, which is 190 bytes for the common case — because this
 * box also holds *ciphertext* on the way in, and a 4096-bit ciphertext is 512
 * bytes of raw output that arrives as 1024 hex characters. The generous headroom
 * is what lets a reader paste something obviously too long and be told the real
 * limit rather than being cut off before the tool can measure it.
 */
export const MAX_RSA_CRYPT_INPUT_LENGTH = 8_192;

/** The same ceiling for an opened file, measured in bytes because that is what
 *  a file has. */
export const MAX_RSA_CRYPT_INPUT_BYTES = 8_192;

export const DEFAULT_RSA_CRYPT_OPTIONS: RsaCryptOptions = {
    keyFormat: DEFAULT_KEY_INPUT_FORMAT,
    keyKind: DEFAULT_KEY_KIND,
    padding: DEFAULT_RSA_PADDING,
    hash: DEFAULT_RSA_CRYPT_HASH,
    textEncoding: DEFAULT_TEXT_ENCODING,
    cipherEncoding: DEFAULT_CIPHER_ENCODING,
};

/** Container names shown in the key-format picker, which are proper names. */
export const KEY_INPUT_FORMAT_LABELS: Record<RsaKeyInputFormat, string> = {
    pem: "PEM",
    der: "DER (Base64)",
    jwk: "JWK (JSON)",
};

/** Likewise the padding scheme's own name. */
export const PADDING_LABELS: Record<RsaPadding, string> = {
    oaep: "OAEP",
};

/**
 * What each key box shows when it is empty.
 *
 * Deliberately here rather than in the message catalogue, for two reasons. These
 * are data — a PEM header is a proper name and is identical in every locale —
 * and the JWK skeleton contains braces, which ICU MessageFormat reads as
 * argument delimiters and would refuse to parse. The BSON converter keeps its
 * sample documents out of the catalogue for exactly the same reason.
 */
export const KEY_PLACEHOLDERS: Record<RsaKeyInputFormat, Record<RsaKeyKind, string>> = {
    pem: {
        public: "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----",
        private: "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----",
    },
    der: {
        public: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…",
        private: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC…",
    },
    jwk: {
        public: '{ "kty": "RSA", "n": "…", "e": "AQAB" }',
        private: '{ "kty": "RSA", "n": "…", "e": "AQAB", "d": "…" }',
    },
};
