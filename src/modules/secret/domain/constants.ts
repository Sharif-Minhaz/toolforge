import type { SecretEncoding, SecretGrade, SecretKeyUse, SecretOptions } from "../types";

/* ----------------------------------------------------------------- names --- */

/**
 * The names these things already have.
 *
 * Proper names are data, not copy: `HMAC-SHA256` is `HMAC-SHA256` in every
 * language, and putting it in the message catalogue invites a translator to
 * localise a token that a reader is going to paste into a config file. The
 * sentences *about* them stay in the catalogue; the names live here.
 */
export const SECRET_ENCODING_LABELS: Record<SecretEncoding, string> = {
    base64url: "base64url",
    base64: "base64",
    hex: "hex",
    base32: "base32",
};

/**
 * The alphabet each encoding draws from, written the way a reference writes it
 * rather than as all sixty-four symbols.
 */
export const SECRET_ALPHABET_SUMMARY: Record<SecretEncoding, string> = {
    base64url: "A–Z a–z 0–9 - _",
    base64: "A–Z a–z 0–9 + /",
    hex: "0–9 a–f",
    base32: "A–Z 2–7",
};

export const SECRET_KEY_USE_LABELS: Record<SecretKeyUse, string> = {
    "aes-128": "AES-128",
    "aes-192": "AES-192",
    "aes-256": "AES-256",
    chacha20: "ChaCha20",
    "hmac-sha256": "HMAC-SHA256",
    "hmac-sha384": "HMAC-SHA384",
    "hmac-sha512": "HMAC-SHA512",
};

/* --------------------------------------------------------------- length --- */

/**
 * Eight bytes is 64 bits — already too few for anything signed, but it is the
 * smallest value that is still a defensible answer to "how short can this go",
 * and refusing to show it would leave the weak band unreachable and therefore
 * untested by a reader. The grade underneath says what it is.
 */
export const MIN_SECRET_BYTES = 8;

/**
 * 512 bytes is far past the point where more helps: every algorithm on this
 * page folds a key longer than its block size back down with a hash. The
 * ceiling exists so the field has one, not because 512 is a recommendation.
 */
export const MAX_SECRET_BYTES = 512;

/**
 * 32 bytes — 256 bits — because it is the key size that HMAC-SHA256, AES-256
 * and ChaCha20 all want, and therefore the right answer to nearly every
 * `AUTH_SECRET`-shaped question that brings somebody here.
 */
export const DEFAULT_SECRET_BYTES = 32;

/** The sizes worth one press: AES-128, AES-192, the 256-bit default, and the
 *  two longer HMAC keys. */
export const SECRET_BYTE_PRESETS = [16, 24, 32, 48, 64] as const;

/* -------------------------------------------------------------- grading --- */

/**
 * Lower bound of each band, in bits.
 *
 * 128 is the line below which a key is the weakest part of any modern
 * construction; 256 is where an attacker's search is bounded by physics rather
 * than by budget, and is what the algorithms in `SECRET_KEY_USE_BYTES` are
 * built around.
 */
export const GRADE_THRESHOLD_BITS: Record<SecretGrade, number> = {
    "below-recommended": 0,
    strong: 128,
    "very-strong": 256,
};

/** The key size each algorithm is specified — or, for HMAC, recommended — at. */
export const SECRET_KEY_USE_BYTES: Record<SecretKeyUse, number> = {
    "aes-128": 16,
    "aes-192": 24,
    "aes-256": 32,
    chacha20: 32,
    "hmac-sha256": 32,
    "hmac-sha384": 48,
    "hmac-sha512": 64,
};

/* ------------------------------------------------------------- variable --- */

/**
 * A short identity field, so it is capped rather than metered: one character
 * over is a mistake, and refusing the keystroke costs nothing. Long enough for
 * the longest name anybody actually writes — `NEXT_PUBLIC_SUPABASE_ANON_KEY` is
 * 29.
 */
export const MAX_VARIABLE_NAME_LENGTH = 64;

/** POSIX's rule for a shell name, which is also what every `.env` reader wants. */
export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const DEFAULT_VARIABLE_NAME = "AUTH_SECRET";

/* ------------------------------------------------------------- defaults --- */

export const DEFAULT_SECRET_OPTIONS: SecretOptions = {
    byteLength: DEFAULT_SECRET_BYTES,
    // Base64url and unpadded, because that is the form that survives being
    // pasted into a URL, a cookie, a YAML file and a `.env` line without
    // escaping — which is where a secret generated here actually ends up.
    encoding: "base64url",
    padded: false,
    shape: "bare",
    variableName: DEFAULT_VARIABLE_NAME,
};
