/**
 * How the drawn bytes are spelled. A literal union so `secret.encodings.<name>`
 * stays statically checkable.
 *
 * Every one of these is the same secret — the encoding decides which characters
 * carry it, never how much entropy it holds. That distinction is the whole
 * reason the tool respells rather than redraws when this changes.
 */
export const SECRET_ENCODINGS = ["base64url", "base64", "hex", "base32"] as const;

export type SecretEncoding = (typeof SECRET_ENCODINGS)[number];

/** How the finished secret is laid out for pasting. */
export const SECRET_SHAPES = ["bare", "env", "export"] as const;

export type SecretShape = (typeof SECRET_SHAPES)[number];

/**
 * Bands over the exact entropy, sharing the Password generator's vocabulary so
 * one site does not rank the same number two different ways.
 */
export const SECRET_GRADES = ["below-recommended", "strong", "very-strong"] as const;

export type SecretGrade = (typeof SECRET_GRADES)[number];

/**
 * Algorithms whose recommended key size is exactly this many bytes.
 *
 * Proper names, so they are data rather than copy and never enter the message
 * catalogue. HMAC accepts a key of any length; what is named here is the size
 * RFC 2104 recommends — the hash's own output length, below which the key is
 * the weak part and above which it is folded back down by the algorithm.
 */
export const SECRET_KEY_USES = [
    "aes-128",
    "aes-192",
    "aes-256",
    "chacha20",
    "hmac-sha256",
    "hmac-sha384",
    "hmac-sha512",
] as const;

export type SecretKeyUse = (typeof SECRET_KEY_USES)[number];

export type SecretOptions = {
    /** How many bytes are drawn. The only control that changes the entropy. */
    readonly byteLength: number;
    readonly encoding: SecretEncoding;
    /** Ignored by the encodings that have no padding — see `supportsPadding`. */
    readonly padded: boolean;
    readonly shape: SecretShape;
    /** Ignored by the `bare` shape — see `supportsVariableName`. */
    readonly variableName: string;
};

export type SecretFailureReason = "invalid_length" | "invalid_variable_name";

export type SecretSuccess = {
    readonly ok: true;
    /** The encoded secret on its own, which is what the clipboard gets. */
    readonly secret: string;
    /** The secret wrapped in the chosen shape — an `.env` line, say. */
    readonly formatted: string;
    readonly byteLength: number;
    /** Exact, never estimated: a drawn byte carries eight bits and no fewer. */
    readonly entropyBits: number;
    readonly grade: SecretGrade;
    /** Algorithms this byte count is the recommended key size for. */
    readonly uses: readonly SecretKeyUse[];
    /** How many characters the encoding spent on those bytes. */
    readonly characterCount: number;
    /** The shell pipeline that produces the same shape. */
    readonly command: string;
};

export type SecretResult =
    SecretSuccess | { readonly ok: false; readonly reason: SecretFailureReason };
