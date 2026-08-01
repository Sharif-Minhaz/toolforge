import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import {
    PASSWORD_LENGTH,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_BITS,
    PBKDF2_SALT_BYTES,
} from "./constants";

/**
 * Passwords on a short link.
 *
 * PBKDF2-HMAC-SHA256 through the Web Crypto API rather than bcrypt or Argon2:
 * this runs on the server, in Bun's test runner, and on whatever runtime the
 * deployment picked, and PBKDF2 is the one memory-hard-adjacent KDF all three
 * already have. No dependency, no WASM load on a redirect path.
 *
 * The stored form carries its own parameters — `pbkdf2$sha256$<iterations>$
 * <salt>$<key>` — so raising the iteration count later does not strand every
 * link already in the table.
 */

const SCHEME = "pbkdf2";

const DIGEST = "sha256";

function toBase64(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

async function deriveKey(
    password: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
        // `salt` is a view; `deriveBits` wants the bytes, and passing the view's
        // own buffer would hand it whatever else shares that allocation.
        { name: "PBKDF2", salt: salt.slice().buffer as ArrayBuffer, iterations, hash: "SHA-256" },
        material,
        PBKDF2_KEY_BITS,
    );

    return new Uint8Array(bits);
}

export type PasswordFailureReason = "weak_password" | "password_too_long";

export type PasswordResult =
    | { readonly ok: true; readonly hash: string }
    | { readonly ok: false; readonly reason: PasswordFailureReason };

/** Length only. A link password is read out loud; composition rules would not survive that. */
export function checkPasswordLength(password: string): PasswordFailureReason | null {
    if (password.length < PASSWORD_LENGTH.min) {
        return "weak_password";
    }

    if (password.length > PASSWORD_LENGTH.max) {
        return "password_too_long";
    }

    return null;
}

export async function hashLinkPassword(
    password: string,
    randomBytes: RandomBytes = cryptoRandomBytes,
): Promise<PasswordResult> {
    const failure = checkPasswordLength(password);

    if (failure !== null) {
        return { ok: false, reason: failure };
    }

    const salt = randomBytes(PBKDF2_SALT_BYTES);
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

    return {
        ok: true,
        hash: [SCHEME, DIGEST, PBKDF2_ITERATIONS, toBase64(salt), toBase64(key)].join("$"),
    };
}

/**
 * Compares every byte regardless of where the first mismatch is. A loop that
 * returned early would leak how much of the derived key was right, one timing
 * measurement at a time.
 */
function equalsConstantTime(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) {
        return false;
    }

    let difference = 0;

    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }

    return difference === 0;
}

/** False for anything unparseable, so a corrupted row locks the link rather than opening it. */
export async function verifyLinkPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");

    if (parts.length !== 5 || parts[0] !== SCHEME || parts[1] !== DIGEST) {
        return false;
    }

    const iterations = Number(parts[2]);

    if (!Number.isSafeInteger(iterations) || iterations <= 0) {
        return false;
    }

    try {
        const salt = fromBase64(parts[3]);
        const expected = fromBase64(parts[4]);
        const actual = await deriveKey(password, salt, iterations);

        return equalsConstantTime(actual, expected);
    } catch {
        return false;
    }
}
