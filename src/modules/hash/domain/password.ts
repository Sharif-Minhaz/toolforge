import { argon2d, argon2i, argon2id, argon2Verify, bcrypt, bcryptVerify } from "hash-wasm";

import type { Argon2Variant, HashOptions } from "../types";

type Argon2Fn = typeof argon2id;

const ARGON2_FUNCTIONS: Record<Argon2Variant, Argon2Fn> = {
    argon2id,
    argon2i,
    argon2d,
};

export async function hashWithBcrypt(
    password: string,
    salt: Uint8Array,
    cost: number,
): Promise<string> {
    return bcrypt({ password, salt, costFactor: cost, outputType: "encoded" });
}

export async function hashWithArgon2(
    password: string,
    salt: Uint8Array,
    variant: Argon2Variant,
    options: HashOptions,
): Promise<string> {
    return ARGON2_FUNCTIONS[variant]({
        password,
        salt,
        parallelism: options.argon2Parallelism,
        memorySize: options.argon2Memory,
        iterations: options.argon2Iterations,
        hashLength: options.argon2HashLength,
        outputType: "encoded",
    });
}

/**
 * Both verifiers throw on a hash they cannot parse rather than returning
 * `false`. Detection runs first, so reaching here with an unparseable hash is
 * already unusual — but a throw at this depth would surface as a blank panel,
 * and "does not match" is the honest answer either way.
 */
export async function verifyBcrypt(password: string, hash: string): Promise<boolean> {
    try {
        return await bcryptVerify({ password, hash });
    } catch {
        return false;
    }
}

export async function verifyArgon2(password: string, hash: string): Promise<boolean> {
    try {
        return await argon2Verify({ password, hash });
    } catch {
        return false;
    }
}
