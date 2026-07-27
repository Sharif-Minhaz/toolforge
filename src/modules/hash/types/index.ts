export const HASH_MODES = ["generate", "compare"] as const;

export type HashMode = (typeof HASH_MODES)[number];

/**
 * Fast one-way digests. They are the wrong tool for passwords precisely because
 * they are fast: the article says so, and the workbench flags it in place.
 */
export const DIGEST_ALGORITHMS = ["md5", "sha1", "sha256", "sha512"] as const;

export type DigestAlgorithm = (typeof DIGEST_ALGORITHMS)[number];

/** Argon2 variants, in RFC 9106 naming. `argon2id` is the recommended default. */
export const ARGON2_VARIANTS = ["argon2id", "argon2i", "argon2d"] as const;

export type Argon2Variant = (typeof ARGON2_VARIANTS)[number];

export const HASH_ALGORITHMS = [
    "md5",
    "sha1",
    "sha256",
    "sha512",
    "bcrypt",
    "argon2id",
    "argon2i",
    "argon2d",
] as const;

export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

/**
 * What an algorithm behaves like, rather than what it is called. Everything
 * that branches on behaviour — salting, cost parameters, output shape, how a
 * comparison is run — branches on this and never on the algorithm name.
 */
export type HashFamily = "digest" | "bcrypt" | "argon2";

/** How a raw digest is rendered. Password hashes carry their own encoding. */
export const DIGEST_ENCODINGS = ["hex", "base64"] as const;

export type DigestEncoding = (typeof DIGEST_ENCODINGS)[number];

/**
 * The `$2?$` marker at the front of a bcrypt hash. All four are the same hash;
 * the letter records which implementation minted it and which historical bug it
 * was written to avoid, so the tool reports it rather than normalising it away.
 */
export const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2x$", "$2y$"] as const;

export type BcryptPrefix = (typeof BCRYPT_PREFIXES)[number];

/* -------------------------------------------------------------- generate --- */

/**
 * Every knob the generator exposes, in one object. Options that do not apply to
 * the selected family are still carried, so switching algorithms and switching
 * back does not lose what was set.
 */
export type HashOptions = {
    readonly algorithm: HashAlgorithm;
    /** Digest rendering. Ignored by bcrypt and Argon2, which are self-encoding. */
    readonly encoding: DigestEncoding;
    /** Upper-cases hex output. Meaningless under base64, and disabled there. */
    readonly uppercase: boolean;
    /** bcrypt work factor; the round count is `2 ** cost`. */
    readonly bcryptCost: number;
    /** Argon2 memory cost in KiB. */
    readonly argon2Memory: number;
    /** Argon2 time cost — how many passes over that memory. */
    readonly argon2Iterations: number;
    /** Argon2 lanes. */
    readonly argon2Parallelism: number;
    /** Argon2 output length in bytes. */
    readonly argon2HashLength: number;
};

export type HashFailureReason =
    | "empty_input"
    | "too_large"
    | "empty_password"
    | "password_too_long"
    | "invalid_cost"
    | "invalid_argon2_parameters"
    | "hashing_failed";

export type HashFailure = {
    readonly ok: false;
    readonly reason: HashFailureReason;
    /** Byte length of the input, set when a byte ceiling is what was hit. */
    readonly bytes?: number;
};

export type HashSuccess = {
    readonly ok: true;
    readonly algorithm: HashAlgorithm;
    readonly family: HashFamily;
    /** Hex, base64, or a `$`-delimited encoded hash, depending on the family. */
    readonly hash: string;
};

export type HashResult = HashSuccess | HashFailure;

/* --------------------------------------------------------------- detect ---- */

/**
 * What a hash string turned out to be. Password hashes carry their parameters
 * in the string itself, so the tool reads them back rather than asking.
 */
export type DetectedHash =
    | { readonly family: "bcrypt"; readonly prefix: BcryptPrefix; readonly cost: number }
    | {
          readonly family: "argon2";
          readonly variant: Argon2Variant;
          readonly version: number;
          /** KiB, as written in the `m=` parameter. */
          readonly memory: number;
          readonly iterations: number;
          readonly parallelism: number;
      }
    | {
          readonly family: "digest";
          readonly algorithm: DigestAlgorithm;
          readonly encoding: DigestEncoding;
      };

/* -------------------------------------------------------------- compare ---- */

/**
 * Which of the two comparisons ran. `verify` re-derives a hash from the
 * left-hand value; `digest` checks two already-hashed values for equality.
 */
export type ComparisonKind = "verify" | "digest";

export type CompareFailureReason =
    | "empty_input"
    | "too_large"
    | "unrecognized_hash"
    | "empty_password"
    | "password_too_long"
    | "comparison_failed";

export type CompareFailure = {
    readonly ok: false;
    readonly reason: CompareFailureReason;
};

export type CompareSuccess = {
    readonly ok: true;
    readonly kind: ComparisonKind;
    /** What the right-hand box was read as, so the UI can show its parameters. */
    readonly detected: DetectedHash;
    readonly match: boolean;
};

export type CompareResult = CompareSuccess | CompareFailure;

/* --------------------------------------------------------------- export ---- */

export type HashExportRequest = {
    readonly mode: HashMode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
