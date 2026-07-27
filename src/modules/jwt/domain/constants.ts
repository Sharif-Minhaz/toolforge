import type { JwtAlgorithm, JwtMode } from "../types";

export const DEFAULT_JWT_MODE: JwtMode = "decode";

export const DEFAULT_JWT_ALGORITHM: JwtAlgorithm = "HS256";

/**
 * Ceiling on a pasted or generated token. Real bearer tokens sit well under a
 * kilobyte; 32 KB leaves room for a bloated one without letting a paste of an
 * entire file re-parse on every keystroke.
 */
export const MAX_JWT_INPUT_LENGTH = 32_768;

/** Ceiling on either JSON box in the encoder, applied before signing. */
export const MAX_JWT_JSON_LENGTH = 16_384;

/** RFC 7519 §4.1.4 leaves leeway to the verifier; 60s is the common choice. */
export const CLOCK_SKEW_SECONDS = 60;

export const SECONDS_PER_DAY = 86_400;

/** An `iat` older than this is worth pointing at, though it is not a failure. */
export const STALE_IAT_DAYS = 30;

/** An `exp` this far out defeats the point of having one. */
export const LONG_LIVED_TOKEN_DAYS = 90;

export const JSON_INDENT = 2;

/** Header parameters that can point a verifier at a key it did not choose. */
export const REMOTE_KEY_HEADERS = ["jku", "jwk", "x5u"] as const;

/**
 * Claim-name fragments that suggest a secret is riding along in a payload
 * anyone can read. Matched case-insensitively as substrings, so `userPassword`
 * and `user_password` both hit. Deliberately excludes the bare word `token`:
 * `refresh_token_id` and friends are too common to be a useful signal.
 */
export const SENSITIVE_CLAIM_FRAGMENTS = [
    "password",
    "passwd",
    "pwd",
    "secret",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "clientsecret",
    "client_secret",
    "creditcard",
    "credit_card",
    "cardnumber",
    "card_number",
    "cvv",
    "ssn",
    "social_security",
] as const;

export const DEFAULT_HEADER_JSON = `{
  "alg": "HS256",
  "typ": "JWT"
}`;

export const DEFAULT_PAYLOAD_JSON = `{
  "sub": "1234567890",
  "name": "John Doe",
  "admin": true,
  "iat": 1516239022
}`;

/**
 * HMAC keys must be at least as long as the hash they feed, so each size gets
 * its own demo secret rather than one that silently fails on HS512.
 */
export const DEMO_SECRETS: Partial<Record<JwtAlgorithm, string>> = {
    HS256: "a-string-secret-at-least-256-bits-long",
    HS384: "a-string-secret-that-is-at-least-384-bits-long-for-hs384-signing",
    HS512: "a-string-secret-that-is-long-enough-to-reach-at-least-512-bits-for-hs512-signing",
};

export const DEFAULT_SECRET = "a-string-secret-at-least-256-bits-long";

/** How long an example token stays valid, so its `exp` reads as a live one. */
export const EXAMPLE_LIFETIME_SECONDS = 3_600;
