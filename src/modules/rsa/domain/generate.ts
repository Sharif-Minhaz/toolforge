import { bytesToBase64 } from "@/modules/tools/domain/base64";
import { RSA_ALGORITHM_NAMES } from "./constants";
import { readModulusBits, readPublicExponent, unwrapPkcs8, unwrapSpki } from "./der";
import { exponentToBytes, isPortableExponent, parsePublicExponent } from "./exponent";
import { pemLabelFor, toPem } from "./pem";
import type {
    RsaKeyFormat,
    RsaKeyKind,
    RsaKeyMaterial,
    RsaKeyPair,
    RsaMaterialResult,
    RsaOptions,
    RsaOutputFormat,
    RsaRenderedKey,
    RsaResult,
    RsaUsage,
} from "../types";

/**
 * Mints one key pair and keeps every representation of it.
 *
 * The split between this and `renderRsaKeyPair` is what lets the two format
 * pickers work without minting a second key: PKCS#8 and PKCS#1 are the same key
 * in two containers, and PEM, DER and JWK are three renderings of those, so
 * changing either picker is a pure re-render of material already in hand. Only
 * the four things baked into the key itself — its width, its exponent, its
 * algorithm and its hash — need a fresh generation, and `isMaterialStale` is
 * what says so.
 *
 * `subtle` is a parameter rather than a global read so the tests exercise the
 * real Web Crypto in Bun while the tool uses the browser's, and so a caller can
 * stub it without a DOM. Everything else in this module is pure.
 *
 * Nothing here ever runs on the server. A private key generated in a route
 * handler would have to cross the network to reach the person it belongs to,
 * which is the one thing a key generator must not do; the page ships an empty
 * output panel and the first key is minted by the press.
 */
export async function generateRsaKeyMaterial(
    options: RsaOptions,
    subtle: SubtleCrypto = crypto.subtle,
): Promise<RsaMaterialResult> {
    const exponent = parsePublicExponent(options.publicExponent);

    if (exponent === null) {
        return { ok: false, reason: "invalid_exponent" };
    }

    let pair: CryptoKeyPair;

    try {
        pair = await subtle.generateKey(
            {
                name: RSA_ALGORITHM_NAMES[options.usage],
                modulusLength: options.keySize,
                publicExponent: exponentToBytes(exponent),
                hash: options.hash,
            },
            true,
            keyUsagesFor(options.usage),
        );
    } catch {
        // Every modulus width this tool offers works in every engine it targets,
        // and the exponent field is the only one a reader can put an
        // unimplemented value into — so a refusal here is attributed to the
        // exponent whenever it is not one of the two every browser accepts.
        // When it *is* one of those two, the cause is genuinely unknown and the
        // refusal says so rather than guessing.
        return {
            ok: false,
            reason: isPortableExponent(exponent) ? "generation_failed" : "unsupported_exponent",
        };
    }

    // Spelled out rather than left to inference: Web Crypto refuses a
    // `Uint8Array` that might be backed by a `SharedArrayBuffer`, and the
    // fingerprint hands `spki` straight to `digest`.
    let spki: Uint8Array<ArrayBuffer>;
    let pkcs8: Uint8Array<ArrayBuffer>;
    let publicJwk: JsonWebKey;
    let privateJwk: JsonWebKey;
    let fingerprintBytes: ArrayBuffer;

    try {
        const [spkiBuffer, pkcs8Buffer, exportedPublic, exportedPrivate] = await Promise.all([
            subtle.exportKey("spki", pair.publicKey),
            subtle.exportKey("pkcs8", pair.privateKey),
            subtle.exportKey("jwk", pair.publicKey),
            subtle.exportKey("jwk", pair.privateKey),
        ]);

        spki = new Uint8Array(spkiBuffer);
        pkcs8 = new Uint8Array(pkcs8Buffer);
        publicJwk = exportedPublic;
        privateJwk = exportedPrivate;
        fingerprintBytes = await subtle.digest("SHA-256", spki);
    } catch {
        return { ok: false, reason: "export_failed" };
    }

    // Unwrapped whichever container the reader asked for: the modulus width and
    // the exponent are read out of this structure, so it is needed even when
    // nothing is going to render it.
    const pkcs1Public = unwrapSpki(spki);
    const pkcs1Private = unwrapPkcs8(pkcs8);

    if (pkcs1Public === null || pkcs1Private === null) {
        return { ok: false, reason: "unreadable_der" };
    }

    const modulusBits = readModulusBits(pkcs1Public);
    const actualExponent = readPublicExponent(pkcs1Public);

    if (modulusBits === null || actualExponent === null) {
        return { ok: false, reason: "unreadable_der" };
    }

    return {
        ok: true,
        material: {
            spki,
            pkcs8,
            pkcs1Public,
            pkcs1Private,
            publicJwk,
            privateJwk,
            modulusBits,
            exponent: actualExponent,
            fingerprint: bytesToBase64(new Uint8Array(fingerprintBytes)),
            usage: options.usage,
            hash: options.hash,
        },
    };
}

/**
 * The same generation, rendered — the one function a caller that just wants a
 * key pair should reach for, and what the tests exercise end to end.
 */
export async function generateRsaKeyPair(
    options: RsaOptions,
    subtle: SubtleCrypto = crypto.subtle,
): Promise<RsaResult> {
    const generated = await generateRsaKeyMaterial(options, subtle);

    if (!generated.ok) {
        return generated;
    }

    return renderRsaKeyPair(generated.material, options.keyFormat, options.outputFormat);
}

/**
 * Material in hand, written out in the chosen container and rendering. Pure, so
 * both format pickers act during render rather than through a second trip to
 * Web Crypto.
 */
export function renderRsaKeyPair(
    material: RsaKeyMaterial,
    keyFormat: RsaKeyFormat,
    outputFormat: RsaOutputFormat,
): RsaKeyPair {
    const pkcs8Container = keyFormat === "pkcs8";

    return {
        ok: true,
        publicKey: renderKey({
            der: pkcs8Container ? material.spki : material.pkcs1Public,
            jwk: material.publicJwk,
            outputFormat,
            keyFormat,
            kind: "public",
        }),
        privateKey: renderKey({
            der: pkcs8Container ? material.pkcs8 : material.pkcs1Private,
            jwk: material.privateJwk,
            outputFormat,
            keyFormat,
            kind: "private",
        }),
        modulusBits: material.modulusBits,
        exponent: material.exponent,
        fingerprint: material.fingerprint,
    };
}

/**
 * Whether the keys on screen still answer the options as they now stand.
 *
 * Only the four properties baked into the key itself count. The container and
 * the rendering are re-derived on every render, so switching PEM to JWK is not a
 * change that makes anything stale — saying it was would send a reader back to a
 * thirty-second 4096-bit generation for a display setting.
 */
export function isMaterialStale(material: RsaKeyMaterial, options: RsaOptions): boolean {
    return (
        material.modulusBits !== options.keySize ||
        material.usage !== options.usage ||
        material.hash !== options.hash ||
        material.exponent !== parsePublicExponent(options.publicExponent)
    );
}

/**
 * What the pair is allowed to do, which Web Crypto insists match the algorithm.
 * A signature scheme signs and verifies; OAEP encrypts and decrypts. Asking for
 * the wrong pair is a `SyntaxError` before any prime is looked for.
 */
export function keyUsagesFor(usage: RsaUsage): KeyUsage[] {
    return usage === "oaep" ? ["encrypt", "decrypt"] : ["sign", "verify"];
}

type RenderRequest = {
    readonly der: Uint8Array;
    readonly jwk: JsonWebKey;
    readonly outputFormat: RsaOutputFormat;
    readonly keyFormat: RsaKeyFormat;
    readonly kind: RsaKeyKind;
};

/**
 * One key in the chosen output format.
 *
 * JWK is the odd one out and the reason `label` is nullable: it carries the RSA
 * numbers as base64url fields rather than as a DER container, so the PKCS#8 /
 * PKCS#1 choice has nothing at all to act on. The workbench disables that picker
 * under JWK rather than letting it sit there changing nothing.
 */
function renderKey({ der, jwk, outputFormat, keyFormat, kind }: RenderRequest): RsaRenderedKey {
    if (outputFormat === "jwk") {
        return { text: `${JSON.stringify(jwk, null, 2)}\n`, label: null };
    }

    if (outputFormat === "der") {
        // One line, unwrapped. A base64 DER blob is pasted into code far more
        // often than it is read, and the output box wraps it visually anyway.
        return { text: bytesToBase64(der), label: null };
    }

    const label = pemLabelFor(keyFormat, kind);

    return { text: toPem(label, der), label };
}
