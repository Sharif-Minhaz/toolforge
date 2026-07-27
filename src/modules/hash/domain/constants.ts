import type { DigestEncoding, HashAlgorithm, HashMode, HashOptions } from "../types";

export const DEFAULT_HASH_MODE: HashMode = "generate";

/** SHA-256 is the safe thing to land on: fast, unbroken, and widely expected. */
export const DEFAULT_HASH_ALGORITHM: HashAlgorithm = "sha256";

export const DEFAULT_DIGEST_ENCODING: DigestEncoding = "hex";

/**
 * Ceiling on the text being hashed. Digests stream happily through megabytes,
 * but this box re-hashes on every settled keystroke, so the limit is about
 * keeping the main thread responsive rather than about the algorithms.
 */
export const MAX_HASH_INPUT_LENGTH = 32_768;

/* --------------------------------------------------------------- bcrypt ---- */

/**
 * bcrypt hashes the first 72 bytes and silently drops the rest. Rejecting the
 * input is the honest response: a tool that quietly truncated would hand back a
 * hash that a longer, different password also matches.
 */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const MIN_BCRYPT_COST = 4;

/**
 * bcrypt itself allows 31. This runs synchronously on the main thread, and each
 * step doubles the work — cost 14 is already about a second, and 31 would hang
 * the tab for years. The ceiling is a UI constraint, not a cryptographic one.
 */
export const MAX_BCRYPT_COST = 14;

export const DEFAULT_BCRYPT_COST = 10;

export const BCRYPT_COST_PRESETS = [10, 12, 14] as const;

/** bcrypt's own base64 alphabet, which is not RFC 4648's and starts at `.`. */
export const BCRYPT_SALT_BYTES = 16;

/* --------------------------------------------------------------- argon2 ---- */

export const MIN_ARGON2_MEMORY = 8;

/** 128 MiB. Well past any production setting, and still allocatable in a tab. */
export const MAX_ARGON2_MEMORY = 131_072;

/** OWASP's current first-choice Argon2id setting. */
export const DEFAULT_ARGON2_MEMORY = 19_456;

export const ARGON2_MEMORY_PRESETS = [7_168, 12_288, 19_456, 46_080] as const;

export const MIN_ARGON2_ITERATIONS = 1;

export const MAX_ARGON2_ITERATIONS = 10;

export const DEFAULT_ARGON2_ITERATIONS = 2;

export const MIN_ARGON2_PARALLELISM = 1;

export const MAX_ARGON2_PARALLELISM = 16;

export const DEFAULT_ARGON2_PARALLELISM = 1;

export const MIN_ARGON2_HASH_LENGTH = 4;

export const MAX_ARGON2_HASH_LENGTH = 64;

export const DEFAULT_ARGON2_HASH_LENGTH = 32;

export const ARGON2_SALT_BYTES = 16;

/** The only version RFC 9106 defines, and the only one hash-wasm emits. */
export const ARGON2_VERSION = 19;

/* ---------------------------------------------------------------- shared --- */

/**
 * Bytes drawn per salt seed. Enough for the largest salt any family here asks
 * for, so one regeneration reseeds every algorithm at once.
 */
export const SALT_SEED_BYTES = 32;

export const DEFAULT_HASH_OPTIONS: HashOptions = {
    algorithm: DEFAULT_HASH_ALGORITHM,
    encoding: DEFAULT_DIGEST_ENCODING,
    uppercase: false,
    bcryptCost: DEFAULT_BCRYPT_COST,
    argon2Memory: DEFAULT_ARGON2_MEMORY,
    argon2Iterations: DEFAULT_ARGON2_ITERATIONS,
    argon2Parallelism: DEFAULT_ARGON2_PARALLELISM,
    argon2HashLength: DEFAULT_ARGON2_HASH_LENGTH,
};

/**
 * Prefilled so the first paint is a worked example rather than an empty box.
 * Deliberately a passphrase and not something that reads like a real secret.
 */
export const SAMPLE_INPUT = "correct horse battery staple";
