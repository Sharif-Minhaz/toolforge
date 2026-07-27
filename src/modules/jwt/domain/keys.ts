import { importPKCS8, importSPKI, importX509 } from "jose";

import type { JwtAlgorithm, JwtKeyFailure, JwtKeyInput, PemKind } from "../types";
import { getKeyFormat } from "./algorithms";
import { decodeBase64UrlToBytes } from "./base64url";

/** What Web Crypto is handed: raw bytes for HMAC, an imported key otherwise. */
export type ResolvedKey = CryptoKey | Uint8Array;

export type KeyResolution = { readonly ok: true; readonly key: ResolvedKey } | JwtKeyFailure;

type SecretInput = Extract<JwtKeyInput, { kind: "secret" }>;

const PEM_KINDS: readonly { readonly pattern: RegExp; readonly kind: PemKind }[] = [
    { pattern: /-----BEGIN\s+PUBLIC KEY-----/, kind: "spki" },
    { pattern: /-----BEGIN\s+PRIVATE KEY-----/, kind: "pkcs8" },
    { pattern: /-----BEGIN\s+CERTIFICATE-----/, kind: "x509" },
    { pattern: /-----BEGIN\s+(?:RSA|EC)\s+(?:PUBLIC|PRIVATE) KEY-----/, kind: "pkcs1" },
];

export function detectPemKind(pem: string): PemKind {
    return PEM_KINDS.find(({ pattern }) => pattern.test(pem))?.kind ?? "unknown";
}

/**
 * Secrets get pasted in whichever base64 dialect the source used, so the
 * standard alphabet and stray padding are accepted before the strict reader
 * runs. Anything outside both alphabets is still a genuine error.
 */
function decodeSecretBytes(secret: string): Uint8Array | null {
    const normalized = secret.trim().replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const decoded = decodeBase64UrlToBytes(normalized);

    return decoded.ok ? decoded.bytes : null;
}

function resolveSecret(input: SecretInput): KeyResolution {
    if (input.secret.trim().length === 0) {
        return { ok: false, reason: "no_key" };
    }

    if (!input.base64url) {
        return { ok: true, key: new TextEncoder().encode(input.secret) };
    }

    const bytes = decodeSecretBytes(input.secret);

    return bytes === null ? { ok: false, reason: "invalid_key" } : { ok: true, key: bytes };
}

async function resolvePem(
    pem: string,
    algorithm: JwtAlgorithm,
    want: "public" | "private",
): Promise<KeyResolution> {
    if (pem.trim().length === 0) {
        return { ok: false, reason: "no_key" };
    }

    const kind = detectPemKind(pem);

    // PKCS#1 blocks (`BEGIN RSA PRIVATE KEY`) predate Web Crypto and it cannot
    // read them; naming the mismatch beats a generic import failure.
    if (kind === "pkcs1") {
        return { ok: false, reason: "unsupported_pem" };
    }

    if (kind === "unknown") {
        return { ok: false, reason: "invalid_key" };
    }

    if (want === "private" && kind !== "pkcs8") {
        return { ok: false, reason: "expected_private_key" };
    }

    if (want === "public" && kind === "pkcs8") {
        return { ok: false, reason: "expected_public_key" };
    }

    try {
        if (want === "private") {
            return { ok: true, key: await importPKCS8(pem, algorithm) };
        }

        return {
            ok: true,
            key:
                kind === "x509"
                    ? await importX509(pem, algorithm)
                    : await importSPKI(pem, algorithm),
        };
    } catch {
        // A PEM whose curve or modulus does not match the chosen algorithm
        // fails here, which is the same user-visible problem as a corrupt one.
        return { ok: false, reason: "invalid_key" };
    }
}

function matchesFormat(algorithm: JwtAlgorithm, input: JwtKeyInput): boolean {
    return getKeyFormat(algorithm) === (input.kind === "secret" ? "secret" : "pem");
}

async function resolveKey(
    algorithm: JwtAlgorithm,
    input: JwtKeyInput,
    want: "public" | "private",
): Promise<KeyResolution> {
    // The workbench swaps the key box with the algorithm, so a mismatch here
    // only happens when a stale link carries one; treating it as "no key yet"
    // opens on an empty box rather than an error.
    if (!matchesFormat(algorithm, input)) {
        return { ok: false, reason: "no_key" };
    }

    if (input.kind === "secret") {
        return resolveSecret(input);
    }

    return resolvePem(input.pem, algorithm, want);
}

export function importVerificationKey(
    algorithm: JwtAlgorithm,
    input: JwtKeyInput,
): Promise<KeyResolution> {
    return resolveKey(algorithm, input, "public");
}

export function importSigningKey(
    algorithm: JwtAlgorithm,
    input: JwtKeyInput,
): Promise<KeyResolution> {
    return resolveKey(algorithm, input, "private");
}

/** Byte length of a secret as it will reach Web Crypto, for the strength hint. */
export function measureSecretBytes(input: SecretInput): number {
    if (!input.base64url) {
        return new TextEncoder().encode(input.secret).length;
    }

    return decodeSecretBytes(input.secret)?.length ?? 0;
}
