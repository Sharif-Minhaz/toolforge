import {
    decodeBinary,
    decodeText,
    encodeBinary,
    encodeText,
} from "@/modules/tools/domain/payload-codec";
import type { CipherBytes } from "@/modules/tools/types";
import { MAX_RSA_CRYPT_INPUT_BYTES, MAX_RSA_CRYPT_INPUT_LENGTH } from "./constants";
import { importRsaCryptKey } from "./import-key";
import { maxOaepMessageBytes } from "./limits";
import type {
    ImportedRsaKey,
    RsaCryptDirection,
    RsaCryptOptions,
    RsaCryptRequest,
    RsaCryptResult,
    RsaCryptSource,
} from "../types";

/**
 * One operation, from the two boxes to the answer, with every refusal named.
 *
 * The one orchestrator both the page and the island call, and the only place
 * that knows the order the checks have to happen in: the key first, because its
 * modulus decides what a legal message even is; then the payload, because that
 * ceiling cannot be quoted until the key is in hand.
 *
 * `subtle` and `importKey` are parameters so a caller can cache imports across
 * keystrokes — importing a 4096-bit key on every settled character would be
 * paid for on every keystroke — and so the tests can drive the failure paths
 * without a DOM.
 */
export type KeyImporter = (
    keyText: string,
    options: RsaCryptOptions,
    want: "public" | "private",
) => Promise<Awaited<ReturnType<typeof importRsaCryptKey>>>;

export async function runRsaCrypt(
    request: RsaCryptRequest,
    importKey: KeyImporter = defaultImporter,
): Promise<RsaCryptResult> {
    const { direction, source, keyText, options } = request;

    // A public key encrypts and a private key undoes it. There is no third
    // arrangement, and this is the line that says so.
    const want = direction === "encrypt" ? "public" : "private";
    const imported = await importKey(keyText, options, want);

    if (!imported.ok) {
        return imported;
    }

    const input = readInput(source, direction, options);

    if (input === null) {
        return { ok: false, reason: "invalid_input_encoding" };
    }

    if (input.length === 0) {
        return { ok: false, reason: "no_input" };
    }

    return direction === "encrypt"
        ? encryptWith(imported, input, options)
        : decryptWith(imported, input, options);
}

/** The default, which is simply "import it every time". */
function defaultImporter(keyText: string, options: RsaCryptOptions, want: "public" | "private") {
    return importRsaCryptKey({
        text: keyText,
        format: options.keyFormat,
        kind: options.keyKind,
        want,
        hash: options.hash,
    });
}

/**
 * The input box as bytes.
 *
 * `null` for text that is not the encoding it claims to be — a hex string with
 * an odd number of digits, base64 with a character outside both alphabets. An
 * opened file is already bytes while encrypting, and is read as text while
 * decrypting, because a ciphertext this tool wrote is hex or base64 in a `.txt`.
 */
function readInput(
    source: RsaCryptSource,
    direction: RsaCryptDirection,
    options: RsaCryptOptions,
): CipherBytes | null {
    if (source.kind === "file") {
        if (direction === "encrypt") {
            return source.bytes;
        }

        return decodeBinary(new TextDecoder().decode(source.bytes), options.cipherEncoding);
    }

    return direction === "encrypt"
        ? decodeText(source.text, options.textEncoding)
        : decodeBinary(source.text, options.cipherEncoding);
}

async function encryptWith(
    imported: ImportedRsaKey,
    plaintext: CipherBytes,
    options: RsaCryptOptions,
): Promise<RsaCryptResult> {
    const limit = maxOaepMessageBytes(imported.modulusBits, options.hash);

    // No message fits, not "this one does not". A 1024-bit key with SHA-512
    // spends 130 bytes of overhead inside a 128-byte modulus, so telling the
    // reader to shorten something would be advice they cannot act on.
    if (limit === null) {
        return { ok: false, reason: "hash_too_large_for_key" };
    }

    if (plaintext.length > limit) {
        return {
            ok: false,
            reason: "message_too_long",
            actualBytes: plaintext.length,
            limitBytes: limit,
        };
    }

    try {
        const encrypted = new Uint8Array(
            await crypto.subtle.encrypt({ name: "RSA-OAEP" }, imported.key, plaintext),
        );

        return {
            ok: true,
            output: encodeBinary(encrypted, options.cipherEncoding),
            bytes: encrypted,
            inputBytes: plaintext.length,
            outputBytes: encrypted.length,
            modulusBits: imported.modulusBits,
        };
    } catch {
        return { ok: false, reason: "encryption_failed" };
    }
}

async function decryptWith(
    imported: ImportedRsaKey,
    ciphertext: CipherBytes,
    options: RsaCryptOptions,
): Promise<RsaCryptResult> {
    let decrypted: Uint8Array<ArrayBuffer>;

    try {
        decrypted = new Uint8Array(
            await crypto.subtle.decrypt({ name: "RSA-OAEP" }, imported.key, ciphertext),
        );
    } catch {
        // OAEP checks its own padding, so this is a real signal rather than a
        // shrug: the wrong key, the wrong hash, or a ciphertext that was
        // altered. All three land here and all three mean "this did not come
        // from this key under these settings".
        return { ok: false, reason: "decryption_failed" };
    }

    const output = encodeText(decrypted, options.textEncoding);

    if (output === null) {
        return { ok: false, reason: "undecodable_text" };
    }

    return {
        ok: true,
        output,
        bytes: decrypted,
        inputBytes: ciphertext.length,
        outputBytes: decrypted.length,
        modulusBits: imported.modulusBits,
    };
}

/**
 * Whether the plaintext encoding picker has anything to act on.
 *
 * It does not while encrypting an opened file: the file's bytes *are* the
 * plaintext, so there is no text for an encoding to describe. The picker is
 * disabled and says so, rather than sitting there taking a value that changes
 * no byte of the result.
 */
export function supportsPlaintextEncoding(
    direction: RsaCryptDirection,
    source: RsaCryptSource,
): boolean {
    return direction !== "encrypt" || source.kind !== "file";
}

/** What the input box is allowed to hold, in whichever unit it currently has. */
export function inputCeilingFor(source: RsaCryptSource): number {
    return source.kind === "file" ? MAX_RSA_CRYPT_INPUT_BYTES : MAX_RSA_CRYPT_INPUT_LENGTH;
}
