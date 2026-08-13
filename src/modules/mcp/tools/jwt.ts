import { z } from "zod";

import { inspectTimeClaims } from "@/modules/jwt/domain/claims";
import {
    MAX_JWT_INPUT_LENGTH,
    MAX_JWT_JSON_LENGTH,
    MAX_JWT_KEY_LENGTH,
    MAX_JWT_SECRET_LENGTH,
} from "@/modules/jwt/domain/constants";
import { decodeJwt } from "@/modules/jwt/domain/decode";
import { inspectSecurity } from "@/modules/jwt/domain/security";
import { signJwt } from "@/modules/jwt/domain/sign";
import { verifyJwtSignature } from "@/modules/jwt/domain/verify";
import type { JwtKeyInput } from "@/modules/jwt/types";
import { jwtAlgorithmSchema } from "@/modules/jwt/validation/jwt-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Decode, verify, sign — three tools, because they are three different
 * conversations and merging them would put a key argument on the one that must
 * never need one.
 *
 * That separation is the security point, not tidiness. Decoding a JWT proves
 * nothing about it: the payload is base64, readable by anyone, and a model that
 * has decoded a token and seen `"admin": true` has learned what the token
 * *claims*, not what is true. The decode tool says so in its own description,
 * because it is the one most likely to be reached for and the one whose result
 * is most likely to be over-read.
 *
 * `verify` takes the algorithm as an argument and never reads it from the
 * token's header. Trusting the header's `alg` is precisely the substitution
 * behind algorithm-confusion attacks — a token that says `alg: none`, or that
 * swaps RS256 for HS256 and signs with the public key as the secret. The domain
 * layer refuses to guess; so does this.
 */

const keyShape = {
    secret: z
        .string()
        .max(MAX_JWT_SECRET_LENGTH)
        .default("")
        .describe("Shared secret for the HMAC algorithms (HS256/384/512)"),
    secretIsBase64Url: z
        .boolean()
        .default(false)
        .describe("Read `secret` as base64url bytes rather than as UTF-8 text"),
    pem: z
        .string()
        .max(MAX_JWT_KEY_LENGTH)
        .default("")
        .describe("PEM key for RSA, ECDSA and EdDSA — public to verify, private to sign"),
};

function readKey(input: { secret: string; secretIsBase64Url: boolean; pem: string }): JwtKeyInput {
    return input.pem.trim().length > 0
        ? { kind: "pem", pem: input.pem }
        : { kind: "secret", secret: input.secret, base64url: input.secretIsBase64Url };
}

export const jwtDecodeTool = defineMcpTool({
    toolId: "jwt",
    verb: "decode",
    title: "Decode a JWT",
    description:
        "Decode a JSON Web Token and return its header, payload, expiry state and a security review — unsigned `alg: none`, a missing or already-passed `exp`, a token issued in the future, sensitive claim names. This reads the token; it does not check the signature, so nothing in the payload is proven. Use `toolforge_jwt_verify` before trusting a claim.",
    kind: "offline",
    inputSchema: z.object({
        token: z
            .string()
            .max(MAX_JWT_INPUT_LENGTH)
            .describe("The token. A leading `Bearer ` is stripped for you"),
    }),
    run: ({ token }) => {
        const decoded = decodeJwt(token);

        if (!decoded.ok) {
            return refuseWithReason("JWT decoder", decoded.reason, {
                segment: decoded.segment ?? null,
                segmentCount: decoded.segmentCount ?? null,
            });
        }

        const now = new Date();
        const timeClaims = inspectTimeClaims(decoded.payload, now);
        const findings = inspectSecurity(decoded, now);

        return succeed(
            `${decoded.algorithm ?? "unknown"} token${
                findings.some((finding) => finding.severity === "critical")
                    ? " — critical findings"
                    : ""
            }`,
            {
                algorithm: decoded.algorithm,
                header: decoded.headerJson,
                payload: decoded.payloadJson,
                timeClaims: timeClaims.map((claim) => ({
                    claim: claim.claim,
                    state: claim.state,
                    at: claim.at === null ? null : claim.at.toISOString(),
                    offsetSeconds: claim.offsetSeconds,
                })),
                findings: findings.map((finding) => ({
                    code: finding.code,
                    severity: finding.severity,
                    subjects: [...finding.subjects],
                })),
                signatureChecked: false,
            },
        );
    },
});

export const jwtVerifyTool = defineMcpTool({
    toolId: "jwt",
    verb: "verify",
    title: "Verify a JWT signature",
    description:
        "Check a JWT's signature against an algorithm and key you name. The algorithm is an argument and is never read from the token's own header — accepting whatever a token declares is what algorithm-confusion attacks rely on, so a token whose header disagrees fails with `algorithm_mismatch`. Supply `secret` for HS*, or `pem` for RS*/PS*/ES*/EdDSA.",
    kind: "offline",
    inputSchema: z.object({
        token: z.string().max(MAX_JWT_INPUT_LENGTH),
        algorithm: jwtAlgorithmSchema.describe(
            "The algorithm the signature must have been made with",
        ),
        ...keyShape,
    }),
    run: async ({ token, algorithm, ...key }) => {
        const result = await verifyJwtSignature({ token, algorithm, key: readKey(key) });

        if (!result.ok) {
            return refuseWithReason("JWT verifier", result.reason);
        }

        return succeed(`Signature valid (${result.algorithm})`, {
            valid: true,
            algorithm: result.algorithm,
        });
    },
});

export const jwtSignTool = defineMcpTool({
    toolId: "jwt",
    verb: "sign",
    title: "Sign a JWT",
    description:
        "Build and sign a JWT from a header and payload written as JSON. The header's `alg` decides how it is signed. `alg: none` is refused: this tool exists to explain unsigned tokens, not to hand one out. Supply `secret` for HS*, or a private-key `pem` for RS*/PS*/ES*/EdDSA.",
    kind: "offline",
    // Signing the same claims twice gives the same token, but the token is a
    // credential — calling this is not the free, repeatable read `readOnly` means.
    readOnly: false,
    inputSchema: z.object({
        headerJson: z
            .string()
            .max(MAX_JWT_JSON_LENGTH)
            .default('{"alg":"HS256","typ":"JWT"}')
            .describe("Header JSON. Its `alg` chooses the signing algorithm"),
        payloadJson: z.string().max(MAX_JWT_JSON_LENGTH).describe("Payload JSON — the claims"),
        ...keyShape,
    }),
    run: async ({ headerJson, payloadJson, ...key }) => {
        const result = await signJwt({ headerJson, payloadJson, key: readKey(key) });

        if (!result.ok) {
            return refuseWithReason("JWT signer", result.reason);
        }

        return succeed("Token signed", { token: result.token });
    },
});
