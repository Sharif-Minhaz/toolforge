import { MAX_AES_INPUT_BYTES, MAX_AES_INPUT_LENGTH } from "./constants";
import { resolveAesKey } from "./key";
import {
    aesAlgorithmName,
    isAuthenticated,
    isBlockAligned,
    isIvLengthSupported,
    ivBytesFor,
    readIvBytes,
    subtleParams,
    tagBytesFor,
} from "./modes";
import { decodeCipher, decodeText, encodeCipher, encodeText } from "./payload";
import type {
    AesDirection,
    AesKeyInput,
    AesKeyResult,
    AesOptions,
    AesRequest,
    AesResult,
    AesSource,
    CipherBytes,
} from "../types";

/** The block width AES works in, and therefore what CBC ciphertext is a multiple of. */
const AES_BLOCK_BYTES = 16;

/**
 * Injected so the workbench can memoise the derivation. The cache key it uses
 * comes from `aesKeyCacheKey`, which is the same code that decides what the
 * derivation reads — the two cannot drift apart.
 */
export type AesKeyResolver = (input: AesKeyInput) => Promise<AesKeyResult>;

function isSourceEmpty(source: AesSource): boolean {
    return source.kind === "file" ? source.bytes.length === 0 : source.text.length === 0;
}

function exceedsInputLimit(source: AesSource): boolean {
    return source.kind === "file"
        ? source.bytes.length > MAX_AES_INPUT_BYTES
        : source.text.length > MAX_AES_INPUT_LENGTH;
}

/**
 * A file opened while decrypting holds ciphertext written as text — hex or
 * base64 — because that is what this tool produces and what a `.txt` saved from
 * it contains. A lossy read is enough: any byte the encoding cannot use is
 * reported as an unreadable payload anyway.
 */
function readSourceText(source: AesSource): string {
    return source.kind === "file" ? new TextDecoder().decode(source.bytes) : source.text;
}

/**
 * Whether the plaintext encoding picker has anything to act on.
 *
 * One predicate, shared by the cipher and the control, so the box can never sit
 * there accepting a setting the operation ignores. Encrypting a file is the
 * single case where it does not: those bytes are the plaintext already.
 */
export function supportsPlaintextEncoding(direction: AesDirection, source: AesSource): boolean {
    return direction === "decrypt" || source.kind === "text";
}

function keyInput(request: AesRequest): AesKeyInput {
    return {
        source: request.options.keySource,
        secret: request.secret,
        saltHex: request.options.saltHex,
        iterations: request.options.iterations,
        keySize: request.options.keySize,
    };
}

async function importAesKey(
    bytes: CipherBytes,
    options: AesOptions,
    usage: "encrypt" | "decrypt",
): Promise<CryptoKey | null> {
    try {
        return await crypto.subtle.importKey(
            "raw",
            bytes,
            { name: aesAlgorithmName(options.mode) },
            false,
            [usage],
        );
    } catch {
        // The byte length was checked before this call, so the only thing left
        // for the engine to object to is the key size itself — Chrome's Web
        // Crypto refuses 192-bit AES outright, while Firefox, Node and Bun
        // accept it. Hence a static option list and a failure raised here.
        return null;
    }
}

/**
 * Everything after the key: reading the payload, running the cipher, and
 * writing the result back out. Both directions come through here, and both
 * report the same three fields, so the workbench never branches on which one
 * produced the answer.
 */
export async function runAes(
    request: AesRequest,
    resolveKey: AesKeyResolver = resolveAesKey,
): Promise<AesResult> {
    const { direction, source, options } = request;

    if (isSourceEmpty(source)) {
        return { ok: false, reason: "empty_input" };
    }

    if (exceedsInputLimit(source)) {
        return { ok: false, reason: "too_large" };
    }

    const iv = readIvBytes(options.mode, options.ivHex);

    if (iv === null) {
        return {
            ok: false,
            reason: "invalid_iv",
            expectedBytes: ivBytesFor(options.mode),
        };
    }

    // Asked before the operation rather than after it, so an engine that will
    // not take this width says so plainly instead of surfacing as a failed tag
    // check — which is what a wrong key looks like, and would send a reader
    // hunting for the wrong problem.
    if (!(await isIvLengthSupported(options.mode, iv.length))) {
        return { ok: false, reason: "unsupported_iv_length", actualBytes: iv.length };
    }

    const key = await resolveKey(keyInput(request));

    if (!key.ok) {
        return key;
    }

    const imported = await importAesKey(key.bytes, options, direction);

    if (imported === null) {
        return { ok: false, reason: "unsupported_key_size" };
    }

    const parameters = subtleParams(options.mode, iv, options.tagLength);

    if (direction === "encrypt") {
        // A file is already bytes, so the plaintext encoding has nothing to act
        // on and is disabled in the UI by the same predicate.
        const plaintext =
            source.kind === "file" ? source.bytes : decodeText(source.text, options.textEncoding);

        if (plaintext === null) {
            return { ok: false, reason: "invalid_input_encoding" };
        }

        try {
            const encrypted = new Uint8Array(
                await crypto.subtle.encrypt(parameters, imported, plaintext),
            );

            return {
                ok: true,
                output: encodeCipher(encrypted, options.cipherEncoding),
                bytes: encrypted,
                inputBytes: plaintext.length,
                outputBytes: encrypted.length,
            };
        } catch {
            return { ok: false, reason: "decryption_failed" };
        }
    }

    const ciphertext = decodeCipher(readSourceText(source), options.cipherEncoding);

    if (ciphertext === null) {
        return { ok: false, reason: "invalid_input_encoding" };
    }

    // Both checks are here rather than left to the engine, which reports a
    // block-alignment problem and a wrong key with the same opaque error.
    if (isBlockAligned(options.mode) && ciphertext.length % AES_BLOCK_BYTES !== 0) {
        return { ok: false, reason: "unaligned_ciphertext", actualBytes: ciphertext.length };
    }

    // Whatever the tag is set to, a GCM ciphertext is at least that long: the
    // tag is appended to it, and an empty plaintext still carries one.
    const tagBytes = tagBytesFor(options.mode, options.tagLength);

    if (ciphertext.length < tagBytes) {
        return {
            ok: false,
            reason: "ciphertext_too_short",
            actualBytes: ciphertext.length,
            expectedBytes: tagBytes,
        };
    }

    let decrypted: CipherBytes;

    try {
        decrypted = new Uint8Array(await crypto.subtle.decrypt(parameters, imported, ciphertext));
    } catch {
        // GCM checked the tag and it did not match; CBC could not unpad. Two
        // different facts, and the authenticated one is worth saying out loud.
        return {
            ok: false,
            reason: isAuthenticated(options.mode) ? "authentication_failed" : "decryption_failed",
        };
    }

    const text = encodeText(decrypted, options.textEncoding);

    if (text === null) {
        return { ok: false, reason: "undecodable_text" };
    }

    return {
        ok: true,
        output: text,
        bytes: decrypted,
        inputBytes: ciphertext.length,
        outputBytes: decrypted.length,
    };
}
