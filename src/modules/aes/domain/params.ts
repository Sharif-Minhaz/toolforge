import { bytesToHex } from "@/modules/tools/domain/hex";
import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import { AES_SALT_BYTES } from "./constants";
import { ivBytesFor, readIvBytes } from "./modes";
import type { AesMode } from "../types";

/**
 * The two public random values the tool hands out.
 *
 * Both are drawn on the server and passed to the island as props. Drawing them
 * in a `useState` initialiser would give the server pass and the client
 * different bytes, and hydration would break on the first paint.
 *
 * The source is injected so a test can pin the output; nothing here ever
 * reaches for `Math.random`.
 */

export function randomHex(
    byteLength: number,
    randomBytes: RandomBytes = cryptoRandomBytes,
): string {
    return bytesToHex(randomBytes(byteLength));
}

export function randomSaltHex(randomBytes: RandomBytes = cryptoRandomBytes): string {
    return randomHex(AES_SALT_BYTES, randomBytes);
}

/**
 * An IV as wide as the mode requires. Switching mode has to redraw it — a
 * 16-byte block is not a GCM nonce, and carrying one across would leave the
 * field holding a value the next operation refuses.
 */
export function randomIvHex(mode: AesMode, randomBytes: RandomBytes = cryptoRandomBytes): string {
    return randomHex(ivBytesFor(mode), randomBytes);
}

/**
 * A fresh IV at the width already in the field, falling back to the mode's own
 * when what is there cannot be read.
 *
 * Under GCM the width is a choice rather than a constant, and a reader who set
 * it to sixteen to match another system did so on purpose. Redrawing at twelve
 * would quietly undo that, and the next ciphertext would be unreadable by the
 * thing they were trying to match — with nothing on screen having changed.
 */
export function redrawIvHex(
    mode: AesMode,
    currentIvHex: string,
    randomBytes: RandomBytes = cryptoRandomBytes,
): string {
    const current = readIvBytes(mode, currentIvHex);

    return randomHex(current?.length ?? ivBytesFor(mode), randomBytes);
}
