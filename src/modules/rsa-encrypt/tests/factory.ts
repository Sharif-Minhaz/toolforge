import { generateRsaKeyPair } from "@/modules/rsa/domain/generate";
import { DEFAULT_RSA_OPTIONS } from "@/modules/rsa/domain/constants";
import type { RsaOutputFormat } from "@/modules/rsa/types";
import type { RsaKeyFormat } from "@/modules/tools/types";
import { DEFAULT_RSA_CRYPT_OPTIONS } from "../domain/constants";
import type { RsaCryptOptions } from "../types";

/**
 * One place every test builds its option set from, so widening
 * `RsaCryptOptions` later is one edit rather than one per call site.
 */
export function options(overrides: Partial<RsaCryptOptions> = {}): RsaCryptOptions {
    return { ...DEFAULT_RSA_CRYPT_OPTIONS, ...overrides };
}

export type KeyPairText = {
    readonly publicKey: string;
    readonly privateKey: string;
};

/**
 * A key pair written by the *sibling tool*, not by a fixture.
 *
 * This is the cross-check that matters most here. The generator's whole job is
 * to emit blocks other systems can read; this tool's whole job is to read
 * blocks. Wiring one to the other means every container the generator can write
 * — PKCS#8, PKCS#1, DER, JWK — is proved importable rather than assumed, and a
 * change to either module that breaks the pair fails a test instead of shipping.
 *
 * 1024-bit because these run through real Web Crypto and prime search at 2048
 * turns a fast suite into a slow one. Where the width matters — the OAEP
 * ceiling — the tests say so and use a wider key.
 */
export async function keyPairText(
    keyFormat: RsaKeyFormat = "pkcs8",
    outputFormat: RsaOutputFormat = "pem",
    keySize: 1024 | 2048 = 1024,
): Promise<KeyPairText> {
    const generated = await generateRsaKeyPair({
        ...DEFAULT_RSA_OPTIONS,
        keySize,
        usage: "oaep",
        keyFormat,
        outputFormat,
    });

    if (!generated.ok) {
        throw new Error(`the generator refused to mint a fixture: ${generated.reason}`);
    }

    return {
        publicKey: generated.publicKey.text,
        privateKey: generated.privateKey.text,
    };
}
