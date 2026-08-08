import { bytesToBase64 } from "@/modules/tools/domain/base64";
import { bytesToHex } from "@/modules/tools/domain/hex";
import { cryptoRandomBytes, pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import type { AesKeySize, AesKeySource } from "../types";

/**
 * Drawing a secret in whichever form the key field is currently reading.
 *
 * A raw key is the easy half: the right number of bytes, written as hex or as
 * base64. A passphrase is the interesting one, because a generated passphrase
 * is about to be stretched into a key — and stretching cannot create entropy it
 * was not given. Iterations make each guess expensive; they do not make a short
 * secret long. So the drawn passphrase carries at least as many bits as the key
 * it will derive, and the length below falls out of that rather than being a
 * round number somebody liked.
 *
 * The source is injected so a test can pin every branch; nothing here ever
 * reaches for `Math.random`.
 */

/**
 * RFC 3986's unreserved set. Sixty-six characters, every one of which survives
 * a shell, a URL, a YAML file and a copy-paste without escaping — which matters
 * more for a value destined for a config file than the two extra bits a wider
 * alphabet would buy.
 */
export const PASSPHRASE_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** Bits each drawn character is worth, given that alphabet. */
const BITS_PER_CHARACTER = Math.log2(PASSPHRASE_ALPHABET.length);

/**
 * How long a passphrase has to be to be worth as much as the key. Rounded up,
 * so the passphrase is never the weaker half of the pair.
 */
export function passphraseLengthFor(keySize: AesKeySize): number {
    return Math.ceil(keySize / BITS_PER_CHARACTER);
}

export function generatePassphrase(
    keySize: AesKeySize,
    randomBytes: RandomBytes = cryptoRandomBytes,
): string {
    let passphrase = "";

    for (let index = 0; index < passphraseLengthFor(keySize); index += 1) {
        passphrase += pickCharacter(PASSPHRASE_ALPHABET, randomBytes);
    }

    return passphrase;
}

/**
 * A secret the key field can read back as-is. Whatever comes out of here is
 * accepted by `resolveAesKey` for the same source and key size — which is the
 * one property worth asserting, and the one a test does assert.
 */
export function generateKeyMaterial(
    source: AesKeySource,
    keySize: AesKeySize,
    randomBytes: RandomBytes = cryptoRandomBytes,
): string {
    if (source === "passphrase") {
        return generatePassphrase(keySize, randomBytes);
    }

    const bytes = randomBytes(keySize / 8);

    return source === "hex" ? bytesToHex(bytes) : bytesToBase64(bytes);
}
