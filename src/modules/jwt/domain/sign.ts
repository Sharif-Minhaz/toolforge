import { CompactSign } from "jose";

import type { JwtKeyInput, JwtSignResult } from "../types";
import { isSupportedAlgorithm, isUnsecuredAlgorithm } from "./algorithms";
import { MAX_JWT_JSON_LENGTH } from "./constants";
import { parseJsonObject } from "./json";
import { importSigningKey } from "./keys";

export type JwtSignRequest = {
    /** Editable header text. Its `alg` decides how the token is signed. */
    readonly headerJson: string;
    readonly payloadJson: string;
    readonly key: JwtKeyInput;
};

export async function signJwt(request: JwtSignRequest): Promise<JwtSignResult> {
    if (
        request.headerJson.length > MAX_JWT_JSON_LENGTH ||
        request.payloadJson.length > MAX_JWT_JSON_LENGTH
    ) {
        return { ok: false, reason: "too_large" };
    }

    const header = parseJsonObject(request.headerJson);

    if (!header.ok) {
        return {
            ok: false,
            reason: header.reason === "invalid_json" ? "invalid_header_json" : "header_not_object",
        };
    }

    const algorithm = header.value.alg;

    if (typeof algorithm !== "string") {
        return { ok: false, reason: "algorithm_missing" };
    }

    // `none` is readable here but never writable: the tool exists to explain
    // unsigned tokens, not to hand one out.
    if (isUnsecuredAlgorithm(algorithm) || !isSupportedAlgorithm(algorithm)) {
        return { ok: false, reason: "unsupported_algorithm" };
    }

    const payload = parseJsonObject(request.payloadJson);

    if (!payload.ok) {
        return {
            ok: false,
            reason:
                payload.reason === "invalid_json" ? "invalid_payload_json" : "payload_not_object",
        };
    }

    const resolved = await importSigningKey(algorithm, request.key);

    if (!resolved.ok) {
        return resolved;
    }

    try {
        // Re-serialised without the editor's indentation, so the result is the
        // compact token a server would actually issue rather than one carrying
        // the whitespace of the box it was typed into.
        const body = new TextEncoder().encode(JSON.stringify(payload.value));
        const token = await new CompactSign(body)
            .setProtectedHeader({ ...header.value, alg: algorithm })
            .sign(resolved.key);

        return { ok: true, token };
    } catch {
        return { ok: false, reason: "signing_failed" };
    }
}
