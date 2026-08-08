/**
 * Modulus widths offered, weakest first — which is also the order the picker
 * reads in, because it is the order a reader thinks in when they are reproducing
 * an older system's parameters.
 *
 * 1024 is here and is not a recommendation. A 1024-bit modulus is below every
 * current guideline and the workbench says so above the button; it exists so
 * somebody checking what a legacy service already issued can reproduce it.
 * 3072 is NIST SP 800-57's 128-bit-equivalent tier, which is what a reader
 * asking for "as strong as AES-256's peers" actually wants.
 */
export const RSA_KEY_SIZES = [1024, 2048, 3072, 4096] as const;

export type RsaKeySize = (typeof RSA_KEY_SIZES)[number];

/**
 * What the key is being made for.
 *
 * Slugs rather than the Web Crypto algorithm names, because these are built into
 * message keys and `RSASSA-PKCS1-v1_5` is a proper name rather than copy — it
 * belongs in `RSA_ALGORITHM_NAMES`, not in a catalogue.
 */
export const RSA_USAGES = ["pkcs1v15", "pss", "oaep"] as const;

export type RsaUsage = (typeof RSA_USAGES)[number];

/**
 * The digests Web Crypto will pair with an RSA key. SHA-1 is deliberately
 * absent: it is still accepted by every engine here, and offering it would be
 * this tool recommending it.
 */
export const RSA_HASHES = ["SHA-256", "SHA-384", "SHA-512"] as const;

export type RsaHash = (typeof RSA_HASHES)[number];

/**
 * Which DER container the two keys are written into.
 *
 * `pkcs8` is the modern pair — `PRIVATE KEY` wrapping the RSA numbers next to an
 * algorithm identifier, with `PUBLIC KEY` (SubjectPublicKeyInfo) opposite it.
 * `pkcs1` is the bare RSA structure that predates both, written as
 * `RSA PRIVATE KEY` and `RSA PUBLIC KEY`, and is what a great deal of older
 * tooling still expects.
 */
export const RSA_KEY_FORMATS = ["pkcs8", "pkcs1"] as const;

export type RsaKeyFormat = (typeof RSA_KEY_FORMATS)[number];

/** How the container is rendered on screen and in the downloaded file. */
export const RSA_OUTPUT_FORMATS = ["pem", "der", "jwk"] as const;

export type RsaOutputFormat = (typeof RSA_OUTPUT_FORMATS)[number];

/** The five PEM headers this tool can write, keyed by what they hold. */
export const PEM_LABELS = {
    spki: "PUBLIC KEY",
    pkcs8: "PRIVATE KEY",
    pkcs1Public: "RSA PUBLIC KEY",
    pkcs1Private: "RSA PRIVATE KEY",
} as const;

export type PemLabel = (typeof PEM_LABELS)[keyof typeof PEM_LABELS];

/**
 * Every way a generation can be refused, each keeping its own name.
 *
 * `invalid_exponent` and `unsupported_exponent` are two different things and
 * stay two different reasons: the first means what was typed is not a public
 * exponent at all, and the second means it is a legal one this engine will not
 * mint. Browsers accept only 3 and 65537; Bun and Node accept any odd integer.
 * Folding them together would tell a reader their arithmetic was wrong when it
 * was their browser that said no.
 */
export type RsaFailureReason =
    | "invalid_exponent"
    | "unsupported_exponent"
    | "generation_failed"
    | "export_failed"
    | "unreadable_der";

export type RsaFailure = {
    readonly ok: false;
    readonly reason: RsaFailureReason;
};

/** One side of the pair, already rendered in the chosen output format. */
export type RsaRenderedKey = {
    readonly text: string;
    /**
     * The PEM header this key was written under, or `null` under DER and JWK
     * where there is no header. Carried so the article and the download can name
     * the container without re-deriving it from the options.
     */
    readonly label: PemLabel | null;
};

/**
 * One generated pair, in every representation of it at once.
 *
 * Kept whole rather than rendered on the way out, because PKCS#8 and PKCS#1 are
 * the same key in two containers and PEM, DER and JWK are three renderings of
 * those — so both format pickers are a pure re-render of what is already here,
 * not a reason to mint a second key. Only the four properties baked into the key
 * itself are recorded alongside it, for `isMaterialStale` to compare against.
 */
export type RsaKeyMaterial = {
    readonly spki: Uint8Array;
    readonly pkcs8: Uint8Array;
    readonly pkcs1Public: Uint8Array;
    readonly pkcs1Private: Uint8Array;
    readonly publicJwk: JsonWebKey;
    readonly privateJwk: JsonWebKey;
    /** Actual modulus width, read back from the key rather than from the option. */
    readonly modulusBits: number;
    /** The exponent the engine used, likewise read back. */
    readonly exponent: number;
    /**
     * Base64 SHA-256 over the SubjectPublicKeyInfo DER — the same bytes
     * `openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64`
     * produces, so a reader can check this against their own shell.
     */
    readonly fingerprint: string;
    /** Baked into the JWK's `alg` and `key_ops`, so a change makes this stale. */
    readonly usage: RsaUsage;
    readonly hash: RsaHash;
};

export type RsaMaterialResult =
    { readonly ok: true; readonly material: RsaKeyMaterial } | RsaFailure;

export type RsaKeyPair = {
    readonly ok: true;
    readonly publicKey: RsaRenderedKey;
    readonly privateKey: RsaRenderedKey;
    readonly modulusBits: number;
    readonly exponent: number;
    readonly fingerprint: string;
};

export type RsaResult = RsaKeyPair | RsaFailure;

/**
 * Everything the generator can be told to do. Options that do not reach the
 * current output format are still carried, so switching away and back does not
 * lose what was set.
 */
export type RsaOptions = {
    readonly keySize: RsaKeySize;
    readonly usage: RsaUsage;
    readonly hash: RsaHash;
    readonly keyFormat: RsaKeyFormat;
    readonly outputFormat: RsaOutputFormat;
    /**
     * Held as the string that was typed rather than as a number, so the field
     * shows what the reader wrote while it is still incomplete. The domain
     * parses it and refuses what is not a public exponent.
     */
    readonly publicExponent: string;
};

/** Which half of the pair a download or a copy is about. */
export const RSA_KEY_KINDS = ["public", "private"] as const;

export type RsaKeyKind = (typeof RSA_KEY_KINDS)[number];

export type RsaExportRequest = {
    readonly kind: RsaKeyKind;
    readonly content: string;
    readonly outputFormat: RsaOutputFormat;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};

export type RsaArchiveRequest = {
    readonly publicKey: string;
    readonly privateKey: string;
    readonly outputFormat: RsaOutputFormat;
    /** Injected so the archive's bytes are deterministic in tests. */
    readonly generatedAt: Date;
};
