import type { HashFailure, HashOptions, HashResult } from "../types";
import {
    getHashFamily,
    isArgon2Variant,
    isDigestAlgorithm,
    isValidArgon2Parameters,
    isValidBcryptCost,
} from "./algorithms";
import { BCRYPT_MAX_PASSWORD_BYTES, MAX_HASH_INPUT_LENGTH } from "./constants";
import { digestText } from "./digest";
import { utf8ByteLength } from "./encoding";
import { hashWithArgon2, hashWithBcrypt } from "./password";
import { deriveSalt } from "./salt";

export type HashRequest = {
    readonly text: string;
    readonly options: HashOptions;
    /** Base64 pool the salted families slice from. Unused by the digests. */
    readonly saltSeed: string;
};

function failure(reason: HashFailure["reason"], bytes?: number): HashFailure {
    return bytes === undefined ? { ok: false, reason } : { ok: false, reason, bytes };
}

/**
 * Everything that can be rejected without doing any work. Runs before the WASM
 * module is even loaded, so a request that cannot succeed costs nothing.
 */
function precheck(request: HashRequest): HashFailure | null {
    const { text, options } = request;
    const family = getHashFamily(options.algorithm);

    if (text.length === 0) {
        return failure(family === "digest" ? "empty_input" : "empty_password");
    }

    if (text.length > MAX_HASH_INPUT_LENGTH) {
        return failure("too_large");
    }

    if (family === "bcrypt") {
        if (!isValidBcryptCost(options.bcryptCost)) {
            return failure("invalid_cost");
        }

        const bytes = utf8ByteLength(text);

        // bcrypt hashes the first 72 bytes and drops the rest. Truncating
        // silently would hand back a hash that a different, longer password
        // also matches, so the input is refused instead.
        if (bytes > BCRYPT_MAX_PASSWORD_BYTES) {
            return failure("password_too_long", bytes);
        }
    }

    if (family === "argon2" && !isValidArgon2Parameters(options)) {
        return failure("invalid_argon2_parameters");
    }

    return null;
}

/**
 * The one hash the generator runs. Async because every algorithm here lives in
 * WebAssembly, and salted because two of the three families are — so unlike a
 * pure conversion, this cannot be derived during render and its result is not
 * reproducible without the seed it was given.
 */
export async function hashText(request: HashRequest): Promise<HashResult> {
    const { text, options, saltSeed } = request;
    const rejected = precheck(request);

    if (rejected !== null) {
        return rejected;
    }

    const { algorithm } = options;
    const family = getHashFamily(algorithm);

    try {
        if (isDigestAlgorithm(algorithm)) {
            const hash = await digestText(text, algorithm, options.encoding, options.uppercase);

            return { ok: true, algorithm, family, hash };
        }

        const salt = deriveSalt(saltSeed, algorithm);
        const hash = isArgon2Variant(algorithm)
            ? await hashWithArgon2(text, salt, algorithm, options)
            : await hashWithBcrypt(text, salt, options.bcryptCost);

        return { ok: true, algorithm, family, hash };
    } catch {
        // The prechecks cover every documented rejection, so anything landing
        // here is the WASM module failing to load or refusing an allocation.
        return failure("hashing_failed");
    }
}
