import { AES_SALT_BYTES, DEFAULT_AES_OPTIONS, MIN_PBKDF2_ITERATIONS } from "../domain/constants";
import { ivBytesFor } from "../domain/modes";
import type { AesOptions, AesRequest, AesSource } from "../types";

/**
 * One place every test constructs a request, so widening `AesOptions` breaks
 * this file rather than sixty call sites.
 *
 * The IV defaults to the width the chosen mode needs, because getting that
 * wrong is a refusal rather than a wrong answer and would mask whatever the
 * test was actually asking about.
 */

export function options(overrides: Partial<AesOptions> = {}): AesOptions {
    const mode = overrides.mode ?? DEFAULT_AES_OPTIONS.mode;

    return {
        ...DEFAULT_AES_OPTIONS,
        saltHex: "00".repeat(AES_SALT_BYTES),
        ivHex: "00".repeat(ivBytesFor(mode)),
        // The floor, not the shipped default. Six hundred thousand rounds is
        // most of a second, and a suite that pays it once per case spends
        // minutes proving things that have nothing to do with the iteration
        // count — and gets close enough to the per-test timeout to be fragile
        // on a loaded machine. Cases that are about the count set it.
        iterations: MIN_PBKDF2_ITERATIONS,
        ...overrides,
        mode,
    };
}

export function textSource(text: string): AesSource {
    return { kind: "text", text };
}

export function fileSource(bytes: readonly number[], name = "payload.bin"): AesSource {
    return { kind: "file", name, bytes: Uint8Array.from(bytes) };
}

/** `input` is the common case; pass `source` for the file one. */
export function request(
    overrides: Partial<Omit<AesRequest, "options">> & {
        input?: string;
        options?: Partial<AesOptions>;
    } = {},
): AesRequest {
    return {
        direction: overrides.direction ?? "encrypt",
        source: overrides.source ?? textSource(overrides.input ?? "hello"),
        secret: overrides.secret ?? "correct horse battery staple",
        options: options(overrides.options),
    };
}

/**
 * Chrome's Web Crypto refuses 192-bit AES; Firefox, Node and Bun accept it.
 * Probed by doing the thing rather than by reading a property, and used to
 * assert the real behaviour where a runtime supports the size and the
 * documented refusal where it does not.
 */
export async function supportsKeySize(bits: number): Promise<boolean> {
    try {
        await crypto.subtle.importKey("raw", new Uint8Array(bits / 8), { name: "AES-CBC" }, false, [
            "encrypt",
        ]);

        return true;
    } catch {
        return false;
    }
}
