import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import type { JwtAlgorithm, JwtKeyInput } from "../types";
import { getKeyFormat } from "./algorithms";
import { DEFAULT_SECRET, DEMO_SECRETS, EXAMPLE_LIFETIME_SECONDS, JSON_INDENT } from "./constants";
import { signJwt } from "./sign";

export type JwtExample = {
    readonly algorithm: JwtAlgorithm;
    readonly headerJson: string;
    readonly payloadJson: string;
    /** The HMAC secret, or a PKCS#8 private key, depending on the family. */
    readonly signingKey: string;
    /** The same secret, or the matching SPKI public key. */
    readonly verificationKey: string;
    readonly token: string;
};

export type JwtExampleRequest = {
    readonly algorithm: JwtAlgorithm;
    /** Injected so an example's `iat` and `exp` are deterministic in tests. */
    readonly issuedAt: Date;
};

export type JwtExampleResult =
    | { readonly ok: true; readonly example: JwtExample }
    | { readonly ok: false; readonly reason: "generation_failed" };

const MILLISECONDS_PER_SECOND = 1000;

type KeyPairPem = { readonly signingKey: string; readonly verificationKey: string };

/**
 * Demo key material for one algorithm. HMAC reuses a published throwaway
 * secret; every other family gets a key pair minted in the browser on the spot,
 * so no private key ever ships in the bundle or sits in the repository.
 */
async function createKeyMaterial(algorithm: JwtAlgorithm): Promise<KeyPairPem> {
    if (getKeyFormat(algorithm) === "secret") {
        const secret = DEMO_SECRETS[algorithm] ?? DEFAULT_SECRET;

        return { signingKey: secret, verificationKey: secret };
    }

    const { privateKey, publicKey } = await generateKeyPair(algorithm, { extractable: true });

    return {
        signingKey: await exportPKCS8(privateKey),
        verificationKey: await exportSPKI(publicKey),
    };
}

function toKeyInput(algorithm: JwtAlgorithm, material: string): JwtKeyInput {
    return getKeyFormat(algorithm) === "secret"
        ? { kind: "secret", secret: material, base64url: false }
        : { kind: "pem", pem: material };
}

/**
 * A ready-to-inspect token for one algorithm, with the key that produced it —
 * the only way the RSA, ECDSA and EdDSA paths are reachable by someone who does
 * not already have a key pair to hand.
 */
export async function createJwtExample(request: JwtExampleRequest): Promise<JwtExampleResult> {
    const { algorithm, issuedAt } = request;
    const issued = Math.floor(issuedAt.getTime() / MILLISECONDS_PER_SECOND);

    const headerJson = JSON.stringify({ alg: algorithm, typ: "JWT" }, null, JSON_INDENT);
    const payloadJson = JSON.stringify(
        {
            sub: "1234567890",
            name: "John Doe",
            admin: true,
            iat: issued,
            exp: issued + EXAMPLE_LIFETIME_SECONDS,
        },
        null,
        JSON_INDENT,
    );

    try {
        const material = await createKeyMaterial(algorithm);
        const signed = await signJwt({
            headerJson,
            payloadJson,
            key: toKeyInput(algorithm, material.signingKey),
        });

        if (!signed.ok) {
            return { ok: false, reason: "generation_failed" };
        }

        return {
            ok: true,
            example: {
                algorithm,
                headerJson,
                payloadJson,
                signingKey: material.signingKey,
                verificationKey: material.verificationKey,
                token: signed.token,
            },
        };
    } catch {
        return { ok: false, reason: "generation_failed" };
    }
}
