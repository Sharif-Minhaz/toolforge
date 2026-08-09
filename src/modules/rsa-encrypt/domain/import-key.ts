import { base64ToBytes } from "@/modules/tools/domain/base64";
import { parsePem } from "@/modules/tools/domain/pem";
import { wrapPkcs1AsPkcs8, wrapPkcs1AsSpki } from "@/modules/tools/domain/rsa-der";
import { PEM_LABELS, type CipherBytes, type RsaKeyKind } from "@/modules/tools/types";
import { MAX_RSA_KEY_LENGTH } from "./constants";
import type { RsaCryptHash, RsaKeyImportResult, RsaKeyInputFormat } from "../types";

/**
 * Turns whatever was pasted into a `CryptoKey` Web Crypto will actually use.
 *
 * Three formats in, two containers underneath each of them, and one direction
 * that has to derive the half it needs from the half it was given. The whole
 * point of the module is that all of that resolves to a named refusal rather
 * than to a `DOMException` surfacing in the output box.
 */

const OAEP = "RSA-OAEP";

/** Which half each PEM header describes, so a mismatch is caught by name. */
const LABEL_KINDS: Record<string, RsaKeyKind> = {
    [PEM_LABELS.spki]: "public",
    [PEM_LABELS.pkcs1Public]: "public",
    [PEM_LABELS.pkcs8]: "private",
    [PEM_LABELS.pkcs1Private]: "private",
};

/** Whether the header names the bare RSA structure, which has to be wrapped. */
const PKCS1_LABELS: ReadonlySet<string> = new Set([
    PEM_LABELS.pkcs1Public,
    PEM_LABELS.pkcs1Private,
]);

export type KeyImportRequest = {
    readonly text: string;
    readonly format: RsaKeyInputFormat;
    /** Which half the reader says this is. */
    readonly kind: RsaKeyKind;
    /** Which half the operation needs — `public` to encrypt, `private` to undo it. */
    readonly want: RsaKeyKind;
    readonly hash: RsaCryptHash;
};

export async function importRsaCryptKey(
    request: KeyImportRequest,
    subtle: SubtleCrypto = crypto.subtle,
): Promise<RsaKeyImportResult> {
    const text = request.text.trim();

    if (text.length === 0) {
        return { ok: false, reason: "no_key" };
    }

    if (text.length > MAX_RSA_KEY_LENGTH) {
        return { ok: false, reason: "unreadable_key" };
    }

    const imported =
        request.format === "jwk"
            ? await importJwk(text, request, subtle)
            : await importDerKey(text, request, subtle);

    if (!imported.ok) {
        return imported;
    }

    // The one asymmetry worth having: somebody encrypting who only has the
    // private half should not have to go and extract the public one first, so
    // the public half is derived from it. The reverse is impossible and is
    // refused above, in `resolveKind`.
    if (request.want === "public" && request.kind === "private") {
        return derivePublicKey(imported.key, request.hash, imported.modulusBits, subtle);
    }

    return imported;
}

/**
 * Checks what was pasted against what the operation needs, before any of it
 * reaches Web Crypto.
 *
 * A public key cannot decrypt — not "will not", cannot: the private exponent is
 * the only thing that undoes the public one, and it is not in a public key at
 * all. So a reader who has selected Public under Decrypt is told which half they
 * are missing, rather than watching `decrypt` throw.
 */
function resolveKind(found: RsaKeyKind, request: KeyImportRequest): RsaKeyImportResult | null {
    if (found !== request.kind) {
        return { ok: false, reason: "wrong_key_kind", foundKind: found };
    }

    if (request.want === "private" && found === "public") {
        return { ok: false, reason: "wrong_key_kind", foundKind: found };
    }

    return null;
}

async function importJwk(
    text: string,
    request: KeyImportRequest,
    subtle: SubtleCrypto,
): Promise<RsaKeyImportResult> {
    let jwk: JsonWebKey;

    try {
        const parsed: unknown = JSON.parse(text);

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { ok: false, reason: "unreadable_key" };
        }

        jwk = parsed as JsonWebKey;
    } catch {
        return { ok: false, reason: "unreadable_key" };
    }

    if (jwk.kty !== "RSA" || typeof jwk.n !== "string") {
        return { ok: false, reason: "unreadable_key" };
    }

    // A JWK says which half it is by whether the private exponent is present,
    // which is more reliable than `key_ops` — plenty of keys in the wild carry
    // neither `key_ops` nor `use`.
    const found: RsaKeyKind = typeof jwk.d === "string" ? "private" : "public";
    const mismatch = resolveKind(found, request);

    if (mismatch !== null) {
        return mismatch;
    }

    return finishImport(() =>
        subtle.importKey(
            "jwk",
            pickRsaJwk(jwk, found),
            { name: OAEP, hash: request.hash },
            true,
            found === "private" ? ["decrypt"] : ["encrypt"],
        ),
    );
}

/**
 * PEM and base64 DER, which differ only in whether a header says what the bytes
 * are.
 *
 * PEM is the easy one: the header names the container, so there is nothing to
 * guess and a mismatch with the Key Type toggle is caught by name. Bare DER says
 * nothing about itself, so the reader's own answer decides, and both containers
 * are tried — the wrapped one first, then the bare PKCS#1 structure wrapped on
 * the way in. Trying rather than sniffing, because Web Crypto's own parser is a
 * better judge of whether these bytes are a key than a second ASN.1 walk here
 * would be.
 */
async function importDerKey(
    text: string,
    request: KeyImportRequest,
    subtle: SubtleCrypto,
): Promise<RsaKeyImportResult> {
    if (request.format === "pem") {
        const block = parsePem(text);

        if (block === null) {
            return { ok: false, reason: "unreadable_key" };
        }

        const found = LABEL_KINDS[block.label];

        if (found === undefined) {
            return { ok: false, reason: "unreadable_key" };
        }

        const mismatch = resolveKind(found, request);

        if (mismatch !== null) {
            return mismatch;
        }

        const der = PKCS1_LABELS.has(block.label)
            ? wrapPkcs1(block.der, found)
            : (block.der as CipherBytes);

        return importContainer(der, found, request, subtle);
    }

    const der = base64ToBytes(text);

    if (der === null) {
        return { ok: false, reason: "unreadable_key" };
    }

    const mismatch = resolveKind(request.kind, request);

    if (mismatch !== null) {
        return mismatch;
    }

    const asWrapped = await importContainer(der, request.kind, request, subtle);

    if (asWrapped.ok) {
        return asWrapped;
    }

    return importContainer(wrapPkcs1(der, request.kind), request.kind, request, subtle);
}

function wrapPkcs1(der: Uint8Array, kind: RsaKeyKind): CipherBytes {
    return kind === "public" ? wrapPkcs1AsSpki(der) : wrapPkcs1AsPkcs8(der);
}

function importContainer(
    der: CipherBytes,
    kind: RsaKeyKind,
    request: KeyImportRequest,
    subtle: SubtleCrypto,
): Promise<RsaKeyImportResult> {
    return finishImport(() =>
        subtle.importKey(
            kind === "public" ? "spki" : "pkcs8",
            der,
            { name: OAEP, hash: request.hash },
            true,
            kind === "public" ? ["encrypt"] : ["decrypt"],
        ),
    );
}

/**
 * Runs an import and reads the modulus width straight off the key.
 *
 * `algorithm.modulusLength` is on every imported RSA key in every engine here,
 * which saves an export-and-measure round trip — and it is the engine's own
 * answer rather than this tool's, which is what the size ceilings should be
 * computed from.
 */
async function finishImport(run: () => Promise<CryptoKey>): Promise<RsaKeyImportResult> {
    try {
        const key = await run();
        const { modulusLength } = key.algorithm as RsaHashedKeyAlgorithm;

        return { ok: true, key, modulusBits: modulusLength };
    } catch {
        return { ok: false, reason: "key_rejected" };
    }
}

/**
 * The public half of a private key, for encrypting with the only key somebody
 * has to hand.
 *
 * Through JWK rather than through the DER, because the private fields are named
 * there and dropping them is a deletion rather than a re-encoding. Everything
 * left — the modulus and the public exponent — is the public key exactly, which
 * `rsa-der.test.ts` confirms by rebuilding the original SPKI from it.
 */
async function derivePublicKey(
    privateKey: CryptoKey,
    hash: RsaCryptHash,
    modulusBits: number,
    subtle: SubtleCrypto,
): Promise<RsaKeyImportResult> {
    try {
        const jwk = await subtle.exportKey("jwk", privateKey);
        const key = await subtle.importKey(
            "jwk",
            pickRsaJwk(jwk, "public"),
            { name: OAEP, hash },
            true,
            ["encrypt"],
        );

        return { ok: true, key, modulusBits };
    } catch {
        return { ok: false, reason: "key_rejected" };
    }
}

/**
 * The RSA fields, and only those.
 *
 * Picked rather than filtered, for two reasons. A pasted JWK carries `alg`,
 * `key_ops` and `use`, and Web Crypto refuses the import whenever any of them
 * disagrees with what is being asked for — this tool's own hash and direction
 * pickers are the authority, so those fields are simply not passed on. And
 * naming what is kept means an unrecognised field in somebody's JWK cannot ride
 * along into `importKey` at all.
 *
 * Asking for `public` from a private key is what derives the public half: the
 * modulus and the public exponent are the whole of it, and dropping the rest is
 * a deletion rather than a re-encoding.
 */
function pickRsaJwk(jwk: JsonWebKey, kind: RsaKeyKind): JsonWebKey {
    const material: JsonWebKey = { kty: "RSA", n: jwk.n, e: jwk.e, ext: true };

    if (kind === "public") {
        return material;
    }

    // The three CRT values are optional in RFC 7518 but present in everything
    // Web Crypto exports, and leaving them out makes decryption several times
    // slower rather than failing outright.
    return { ...material, d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi };
}
