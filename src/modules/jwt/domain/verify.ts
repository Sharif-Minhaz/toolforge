import { compactVerify, errors } from "jose";

import type { JwtAlgorithm, JwtKeyInput, JwtVerifyResult } from "../types";
import { normalizeToken } from "./decode";
import { importVerificationKey } from "./keys";

export type JwtVerifyRequest = {
    readonly token: string;
    /**
     * The algorithm the signature is checked against. Passed explicitly and
     * never read from the token's own header inside this function: accepting
     * whatever `alg` a token declares is exactly the substitution that
     * algorithm-confusion attacks depend on. The caller decides, and a
     * disagreement surfaces as `algorithm_mismatch`.
     */
    readonly algorithm: JwtAlgorithm;
    readonly key: JwtKeyInput;
};

function describeFailure(caught: unknown): JwtVerifyResult {
    if (caught instanceof errors.JOSEAlgNotAllowed) {
        return { ok: false, reason: "algorithm_mismatch" };
    }

    if (caught instanceof errors.JWSSignatureVerificationFailed) {
        return { ok: false, reason: "signature_mismatch" };
    }

    if (caught instanceof errors.JOSENotSupported) {
        return { ok: false, reason: "unsupported_algorithm" };
    }

    if (caught instanceof errors.JWSInvalid || caught instanceof errors.JWKInvalid) {
        return { ok: false, reason: "malformed_token" };
    }

    // Web Crypto rejects a key whose type or curve cannot carry the algorithm
    // with a plain `TypeError`, which is a key problem, not a token one.
    return { ok: false, reason: "invalid_key" };
}

/** Checks a token's signature against one explicitly chosen algorithm and key. */
export async function verifyJwtSignature(request: JwtVerifyRequest): Promise<JwtVerifyResult> {
    const token = normalizeToken(request.token);

    if (token.length === 0) {
        return { ok: false, reason: "malformed_token" };
    }

    const resolved = await importVerificationKey(request.algorithm, request.key);

    if (!resolved.ok) {
        return resolved;
    }

    try {
        await compactVerify(token, resolved.key, { algorithms: [request.algorithm] });

        return { ok: true, algorithm: request.algorithm };
    } catch (caught) {
        return describeFailure(caught);
    }
}
