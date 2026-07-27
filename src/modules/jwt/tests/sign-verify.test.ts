import { describe, expect, test } from "bun:test";

import { decodeBase64UrlToText } from "@/modules/jwt/domain/base64url";
import { DEFAULT_SECRET, MAX_JWT_JSON_LENGTH } from "@/modules/jwt/domain/constants";
import { decodeJwt } from "@/modules/jwt/domain/decode";
import { createJwtExample } from "@/modules/jwt/domain/examples";
import { detectPemKind, measureSecretBytes } from "@/modules/jwt/domain/keys";
import { signJwt } from "@/modules/jwt/domain/sign";
import { verifyJwtSignature } from "@/modules/jwt/domain/verify";
import { JWT_ALGORITHMS, type JwtAlgorithm, type JwtKeyInput } from "@/modules/jwt/types";

const ISSUED_AT = new Date("2026-07-27T12:00:00.000Z");

const HEADER = '{"alg":"HS256","typ":"JWT"}';
const PAYLOAD = '{"sub":"1234567890"}';

const SECRET: JwtKeyInput = { kind: "secret", secret: DEFAULT_SECRET, base64url: false };

/** A PKCS#1 block, which Web Crypto cannot read at all. */
const PKCS1_PEM = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----";

async function exampleFor(algorithm: JwtAlgorithm) {
    const result = await createJwtExample({ algorithm, issuedAt: ISSUED_AT });

    if (!result.ok) {
        throw new Error(`could not build an example for ${algorithm}`);
    }

    return result.example;
}

function keyInputFor(algorithm: JwtAlgorithm, material: string): JwtKeyInput {
    return algorithm.startsWith("HS")
        ? { kind: "secret", secret: material, base64url: false }
        : { kind: "pem", pem: material };
}

describe("signJwt and verifyJwtSignature", () => {
    test("round-trips every supported algorithm", async () => {
        for (const algorithm of JWT_ALGORITHMS) {
            const example = await exampleFor(algorithm);
            const verified = await verifyJwtSignature({
                token: example.token,
                algorithm,
                key: keyInputFor(algorithm, example.verificationKey),
            });

            expect(verified).toEqual({ ok: true, algorithm });
        }
    }, 60_000);

    test("signs the payload compactly, whatever indentation was typed", async () => {
        const signed = await signJwt({
            headerJson: '{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
            payloadJson: '{\n  "sub": "1234567890"\n}',
            key: SECRET,
        });

        if (!signed.ok) {
            throw new Error(`expected a signed token, got ${signed.reason}`);
        }

        const decodedToken = decodeJwt(signed.token);

        if (!decodedToken.ok) {
            throw new Error(`expected the signed token to decode, got ${decodedToken.reason}`);
        }

        // The bytes the signature covers, read back out of the token itself.
        expect(decodeBase64UrlToText(decodedToken.segments.payload)).toEqual({
            ok: true,
            text: '{"sub":"1234567890"}',
        });
    });

    test("takes the algorithm from the header, not from a separate control", async () => {
        const signed = await signJwt({
            headerJson: '{"alg":"HS512","typ":"JWT"}',
            payloadJson: PAYLOAD,
            key: SECRET,
        });

        if (!signed.ok) {
            throw new Error(`expected a signed token, got ${signed.reason}`);
        }

        const decodedToken = decodeJwt(signed.token);

        expect(decodedToken.ok && decodedToken.algorithm).toBe("HS512");
    });

    test("refuses to mint an unsigned token", async () => {
        expect(
            await signJwt({ headerJson: '{"alg":"none"}', payloadJson: PAYLOAD, key: SECRET }),
        ).toEqual({ ok: false, reason: "unsupported_algorithm" });
    });

    test("reports each way the editable JSON can be wrong", async () => {
        expect(await signJwt({ headerJson: "{oops", payloadJson: PAYLOAD, key: SECRET })).toEqual({
            ok: false,
            reason: "invalid_header_json",
        });

        expect(await signJwt({ headerJson: "[]", payloadJson: PAYLOAD, key: SECRET })).toEqual({
            ok: false,
            reason: "header_not_object",
        });

        expect(await signJwt({ headerJson: HEADER, payloadJson: "{oops", key: SECRET })).toEqual({
            ok: false,
            reason: "invalid_payload_json",
        });

        expect(await signJwt({ headerJson: HEADER, payloadJson: "[1]", key: SECRET })).toEqual({
            ok: false,
            reason: "payload_not_object",
        });

        expect(
            await signJwt({ headerJson: '{"typ":"JWT"}', payloadJson: PAYLOAD, key: SECRET }),
        ).toEqual({ ok: false, reason: "algorithm_missing" });

        expect(
            await signJwt({ headerJson: '{"alg":"HS999"}', payloadJson: PAYLOAD, key: SECRET }),
        ).toEqual({ ok: false, reason: "unsupported_algorithm" });
    });

    test("refuses an oversized editor buffer", async () => {
        expect(
            await signJwt({
                headerJson: HEADER,
                payloadJson: "x".repeat(MAX_JWT_JSON_LENGTH + 1),
                key: SECRET,
            }),
        ).toEqual({ ok: false, reason: "too_large" });
    });

    test("reports a missing key before touching the token", async () => {
        expect(
            await signJwt({
                headerJson: HEADER,
                payloadJson: PAYLOAD,
                key: { kind: "secret", secret: "   ", base64url: false },
            }),
        ).toEqual({ ok: false, reason: "no_key" });
    });

    test("names a public key handed to the signer", async () => {
        const example = await exampleFor("ES256");

        expect(
            await signJwt({
                headerJson: '{"alg":"ES256"}',
                payloadJson: PAYLOAD,
                key: { kind: "pem", pem: example.verificationKey },
            }),
        ).toEqual({ ok: false, reason: "expected_private_key" });
    });

    test("names a private key handed to the verifier", async () => {
        const example = await exampleFor("ES256");

        expect(
            await verifyJwtSignature({
                token: example.token,
                algorithm: "ES256",
                key: { kind: "pem", pem: example.signingKey },
            }),
        ).toEqual({ ok: false, reason: "expected_public_key" });
    });

    test("names a PEM Web Crypto cannot read", async () => {
        expect(
            await signJwt({
                headerJson: '{"alg":"RS256"}',
                payloadJson: PAYLOAD,
                key: { kind: "pem", pem: PKCS1_PEM },
            }),
        ).toEqual({ ok: false, reason: "unsupported_pem" });
    });

    test("rejects a signature made with a different secret", async () => {
        const signed = await signJwt({ headerJson: HEADER, payloadJson: PAYLOAD, key: SECRET });

        if (!signed.ok) {
            throw new Error(`expected a signed token, got ${signed.reason}`);
        }

        expect(
            await verifyJwtSignature({
                token: signed.token,
                algorithm: "HS256",
                key: { kind: "secret", secret: `${DEFAULT_SECRET}!`, base64url: false },
            }),
        ).toEqual({ ok: false, reason: "signature_mismatch" });
    });

    test("refuses to check an HS256 token as RS256", async () => {
        const example = await exampleFor("HS256");
        const rsa = await exampleFor("RS256");

        expect(
            await verifyJwtSignature({
                token: example.token,
                algorithm: "RS256",
                key: { kind: "pem", pem: rsa.verificationKey },
            }),
        ).toEqual({ ok: false, reason: "algorithm_mismatch" });
    }, 30_000);

    test("reports a token that is not a JWS at all", async () => {
        expect(
            await verifyJwtSignature({ token: "nonsense", algorithm: "HS256", key: SECRET }),
        ).toEqual({ ok: false, reason: "malformed_token" });

        expect(await verifyJwtSignature({ token: "  ", algorithm: "HS256", key: SECRET })).toEqual({
            ok: false,
            reason: "malformed_token",
        });
    });

    test("verifies a token pasted with its Authorization scheme", async () => {
        const example = await exampleFor("HS256");

        expect(
            await verifyJwtSignature({
                token: `Bearer ${example.token}\n`,
                algorithm: "HS256",
                key: keyInputFor("HS256", example.verificationKey),
            }),
        ).toEqual({ ok: true, algorithm: "HS256" });
    });
});

describe("base64url secrets", () => {
    test("signs with the decoded bytes, not the text", async () => {
        const raw: JwtKeyInput = { kind: "secret", secret: "AAECAwQFBgc", base64url: true };
        const signed = await signJwt({ headerJson: HEADER, payloadJson: PAYLOAD, key: raw });

        if (!signed.ok) {
            throw new Error(`expected a signed token, got ${signed.reason}`);
        }

        expect(
            await verifyJwtSignature({ token: signed.token, algorithm: "HS256", key: raw }),
        ).toEqual({ ok: true, algorithm: "HS256" });

        expect(
            await verifyJwtSignature({
                token: signed.token,
                algorithm: "HS256",
                key: { kind: "secret", secret: "AAECAwQFBgc", base64url: false },
            }),
        ).toEqual({ ok: false, reason: "signature_mismatch" });
    });

    test("accepts a secret pasted in the standard alphabet with padding", () => {
        const standard = measureSecretBytes({ kind: "secret", secret: "+/8=", base64url: true });

        expect(standard).toBe(2);
    });

    test("reports a secret that is not base64 in either alphabet", async () => {
        expect(
            await signJwt({
                headerJson: HEADER,
                payloadJson: PAYLOAD,
                key: { kind: "secret", secret: "not base64 !!", base64url: true },
            }),
        ).toEqual({ ok: false, reason: "invalid_key" });
    });

    test("measures UTF-8 bytes, not characters", () => {
        expect(measureSecretBytes({ kind: "secret", secret: "কী", base64url: false })).toBe(6);
    });
});

describe("detectPemKind", () => {
    test("separates the block types the tool handles", () => {
        expect(detectPemKind("-----BEGIN PUBLIC KEY-----\nA\n-----END PUBLIC KEY-----")).toBe(
            "spki",
        );
        expect(detectPemKind("-----BEGIN PRIVATE KEY-----\nA\n-----END PRIVATE KEY-----")).toBe(
            "pkcs8",
        );
        expect(detectPemKind("-----BEGIN CERTIFICATE-----\nA\n-----END CERTIFICATE-----")).toBe(
            "x509",
        );
        expect(detectPemKind(PKCS1_PEM)).toBe("pkcs1");
        expect(detectPemKind("-----BEGIN EC PRIVATE KEY-----\nA\n----")).toBe("pkcs1");
        expect(detectPemKind("just some text")).toBe("unknown");
    });
});
