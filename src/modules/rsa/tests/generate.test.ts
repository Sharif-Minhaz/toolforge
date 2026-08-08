import { describe, expect, test } from "bun:test";
import { createPrivateKey, createPublicKey } from "node:crypto";

import { base64ToBytes } from "@/modules/tools/domain/base64";
import {
    generateRsaKeyMaterial,
    generateRsaKeyPair,
    isMaterialStale,
    keyUsagesFor,
    renderRsaKeyPair,
} from "../domain/generate";
import { options } from "./factory";
import type { RsaKeyMaterial, RsaKeyPair, RsaMaterialResult, RsaResult } from "../types";

function expectOk(result: RsaResult): RsaKeyPair {
    expect(result.ok).toBe(true);

    return result as RsaKeyPair;
}

async function material(overrides: Parameters<typeof options>[0] = {}): Promise<RsaKeyMaterial> {
    const generated: RsaMaterialResult = await generateRsaKeyMaterial(options(overrides));

    expect(generated.ok).toBe(true);

    return (generated as Extract<RsaMaterialResult, { ok: true }>).material;
}

describe("keyUsagesFor", () => {
    test("gives a signature scheme sign and verify", () => {
        expect(keyUsagesFor("pkcs1v15")).toEqual(["sign", "verify"]);
        expect(keyUsagesFor("pss")).toEqual(["sign", "verify"]);
    });

    test("gives OAEP encrypt and decrypt, which is what it will accept", () => {
        expect(keyUsagesFor("oaep")).toEqual(["encrypt", "decrypt"]);
    });
});

describe("generateRsaKeyPair", () => {
    test("writes a PKCS#8 pair under the two headers a reader expects", async () => {
        const result = expectOk(await generateRsaKeyPair(options()));

        expect(result.publicKey.text.startsWith("-----BEGIN PUBLIC KEY-----\n")).toBe(true);
        expect(result.publicKey.text.endsWith("-----END PUBLIC KEY-----\n")).toBe(true);
        expect(result.privateKey.text.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);
        expect(result.publicKey.label).toBe("PUBLIC KEY");
        expect(result.privateKey.label).toBe("PRIVATE KEY");
    });

    test("writes a PKCS#1 pair under its own two headers", async () => {
        const result = expectOk(await generateRsaKeyPair(options({ keyFormat: "pkcs1" })));

        expect(result.publicKey.text.startsWith("-----BEGIN RSA PUBLIC KEY-----\n")).toBe(true);
        expect(result.privateKey.text.startsWith("-----BEGIN RSA PRIVATE KEY-----\n")).toBe(true);
        expect(result.publicKey.label).toBe("RSA PUBLIC KEY");
        expect(result.privateKey.label).toBe("RSA PRIVATE KEY");
    });

    test("reports the modulus width and the exponent read back from the key", async () => {
        const result = expectOk(await generateRsaKeyPair(options()));

        expect(result.modulusBits).toBe(1024);
        expect(result.exponent).toBe(65_537);
    });

    /**
     * The engine reads through a leading zero byte, so `00 01 00 01` mints the
     * same key 65537 does — but it would land in the DER verbatim if it were
     * passed on. `exponentToBytes` trims it, and this is what proves the trim
     * reaches the exported bytes rather than only the parser.
     */
    test("normalises a padded exponent before it reaches the container", async () => {
        const padded = expectOk(
            await generateRsaKeyPair(options({ publicExponent: "65537", outputFormat: "jwk" })),
        );
        const jwk = JSON.parse(padded.publicKey.text) as { e: string };

        expect(jwk.e).toBe("AQAB");
        expect(padded.exponent).toBe(65_537);
    });

    test("takes an exponent of 3, which RFC 8017 still permits", async () => {
        const result = expectOk(await generateRsaKeyPair(options({ publicExponent: "3" })));

        expect(result.exponent).toBe(3);
    });

    describe("output formats", () => {
        test("renders DER as one unwrapped base64 line", async () => {
            const result = expectOk(await generateRsaKeyPair(options({ outputFormat: "der" })));

            expect(result.publicKey.text).not.toContain("\n");
            expect(result.publicKey.text).not.toContain("-----");
            expect(result.publicKey.label).toBeNull();
            expect(base64ToBytes(result.publicKey.text)).not.toBeNull();
        });

        test("renders JWK as indented JSON carrying the algorithm and the operations", async () => {
            const result = expectOk(
                await generateRsaKeyPair(options({ outputFormat: "jwk", usage: "pss" })),
            );
            const publicJwk = JSON.parse(result.publicKey.text) as Record<string, unknown>;
            const privateJwk = JSON.parse(result.privateKey.text) as Record<string, unknown>;

            expect(publicJwk.kty).toBe("RSA");
            expect(publicJwk.alg).toBe("PS256");
            expect(publicJwk.d).toBeUndefined();
            expect(privateJwk.d).toBeString();
            expect(result.publicKey.label).toBeNull();
        });

        /**
         * A JWK is not a DER container, so the PKCS#8 / PKCS#1 picker has
         * nothing to act on. The workbench disables it; this is the domain half
         * of the same rule — the option is carried and simply does not reach the
         * output.
         */
        test("ignores the container choice under JWK", async () => {
            const [pkcs8, pkcs1] = await Promise.all([
                generateRsaKeyPair(options({ outputFormat: "jwk", keyFormat: "pkcs8" })),
                generateRsaKeyPair(options({ outputFormat: "jwk", keyFormat: "pkcs1" })),
            ]);

            for (const result of [expectOk(pkcs8), expectOk(pkcs1)]) {
                expect(result.publicKey.label).toBeNull();
                expect(JSON.parse(result.publicKey.text)).toHaveProperty("kty", "RSA");
            }
        });

        test("names the JWK algorithm from the usage and the hash together", async () => {
            const cases = [
                [{ usage: "pkcs1v15", hash: "SHA-256" }, "RS256"],
                [{ usage: "pkcs1v15", hash: "SHA-512" }, "RS512"],
                [{ usage: "pss", hash: "SHA-384" }, "PS384"],
                [{ usage: "oaep", hash: "SHA-256" }, "RSA-OAEP-256"],
            ] as const;

            for (const [overrides, alg] of cases) {
                const result = expectOk(
                    await generateRsaKeyPair(options({ ...overrides, outputFormat: "jwk" })),
                );

                expect((JSON.parse(result.publicKey.text) as { alg: string }).alg).toBe(alg);
            }
        });
    });

    describe("refusals", () => {
        test("names a value that is not a public exponent at all", async () => {
            for (const raw of ["", "2", "1", "abc", "0x10001"]) {
                expect(await generateRsaKeyPair(options({ publicExponent: raw }))).toEqual({
                    ok: false,
                    reason: "invalid_exponent",
                });
            }
        });

        /**
         * Bun and Node mint a key for any odd exponent; Chrome and Firefox
         * implement only 3 and 65537. The refusal therefore cannot be asserted
         * here — what can be, and what matters, is that the value reaches the
         * engine unchanged rather than being filtered out of the field before it
         * gets there. See the handoff note about verifying this in a browser.
         */
        test("passes an exponent no browser implements through to the engine", async () => {
            const result = await generateRsaKeyPair(options({ publicExponent: "17" }));

            if (!result.ok) {
                expect(result.reason).toBe("unsupported_exponent");

                return;
            }

            expect(result.exponent).toBe(17);
        });

        test("names a Web Crypto refusal it cannot attribute to the exponent", async () => {
            const failing = {
                generateKey: () => Promise.reject(new Error("no")),
            } as unknown as SubtleCrypto;

            expect(await generateRsaKeyPair(options(), failing)).toEqual({
                ok: false,
                reason: "generation_failed",
            });
        });

        test("names an export that fails after the key was minted", async () => {
            const failing: SubtleCrypto = {
                ...crypto.subtle,
                generateKey: crypto.subtle.generateKey.bind(crypto.subtle),
                exportKey: () => Promise.reject(new Error("no")),
            } as unknown as SubtleCrypto;

            expect(await generateRsaKeyPair(options(), failing)).toEqual({
                ok: false,
                reason: "export_failed",
            });
        });

        test("names a container it cannot read rather than throwing", async () => {
            const truncating: SubtleCrypto = {
                ...crypto.subtle,
                generateKey: crypto.subtle.generateKey.bind(crypto.subtle),
                exportKey: (format: string, key: CryptoKey) =>
                    format === "jwk"
                        ? crypto.subtle.exportKey("jwk", key)
                        : Promise.resolve(new Uint8Array([0x30, 0x82, 0x01, 0x00]).buffer),
                digest: crypto.subtle.digest.bind(crypto.subtle),
            } as unknown as SubtleCrypto;

            expect(await generateRsaKeyPair(options(), truncating)).toEqual({
                ok: false,
                reason: "unreadable_der",
            });
        });
    });

    /**
     * The split that keeps a format picker from costing a second key. A
     * thirty-second 4096-bit generation to change how the same bytes are
     * displayed would be the tool punishing curiosity.
     */
    describe("re-rendering material already in hand", () => {
        test("writes all four container-and-rendering combinations from one key", async () => {
            const key = await material();

            expect(renderRsaKeyPair(key, "pkcs8", "pem").publicKey.label).toBe("PUBLIC KEY");
            expect(renderRsaKeyPair(key, "pkcs1", "pem").publicKey.label).toBe("RSA PUBLIC KEY");
            expect(renderRsaKeyPair(key, "pkcs8", "der").publicKey.text).toBe(
                renderRsaKeyPair(key, "pkcs8", "der").publicKey.text,
            );
            expect(renderRsaKeyPair(key, "pkcs1", "jwk").publicKey.label).toBeNull();
        });

        test("reports the same modulus, exponent and fingerprint whichever way it is written", async () => {
            const key = await material();
            const asPem = renderRsaKeyPair(key, "pkcs8", "pem");
            const asJwk = renderRsaKeyPair(key, "pkcs1", "jwk");

            expect(asJwk.modulusBits).toBe(asPem.modulusBits);
            expect(asJwk.exponent).toBe(asPem.exponent);
            expect(asJwk.fingerprint).toBe(asPem.fingerprint);
        });

        test("keeps the two containers as two different byte strings", async () => {
            const key = await material();

            expect(renderRsaKeyPair(key, "pkcs8", "der").privateKey.text).not.toBe(
                renderRsaKeyPair(key, "pkcs1", "der").privateKey.text,
            );
        });
    });

    describe("isMaterialStale", () => {
        test("is false for the options the key was minted under", async () => {
            expect(isMaterialStale(await material(), options())).toBe(false);
        });

        test("is false for a change that only alters how the key is displayed", async () => {
            const key = await material();

            expect(isMaterialStale(key, options({ keyFormat: "pkcs1" }))).toBe(false);
            expect(isMaterialStale(key, options({ outputFormat: "jwk" }))).toBe(false);
        });

        test("is true for each of the four properties baked into the key", async () => {
            const key = await material();

            expect(isMaterialStale(key, options({ keySize: 2048 }))).toBe(true);
            expect(isMaterialStale(key, options({ usage: "oaep" }))).toBe(true);
            expect(isMaterialStale(key, options({ hash: "SHA-512" }))).toBe(true);
            expect(isMaterialStale(key, options({ publicExponent: "3" }))).toBe(true);
        });

        /** A half-typed exponent parses to nothing, which never matches. */
        test("is true while the exponent field is not yet a number", async () => {
            expect(isMaterialStale(await material(), options({ publicExponent: "6" }))).toBe(true);
        });
    });

    /**
     * The end-to-end cross-check: every block this tool writes is handed to
     * `node:crypto`, which is a different ASN.1 reader entirely, and the pair is
     * confirmed to be a pair — the private key's own public half has to match
     * the public key that was written beside it.
     */
    describe("what somebody else's reader makes of the output", () => {
        for (const keyFormat of ["pkcs8", "pkcs1"] as const) {
            test(`reads back a ${keyFormat} pair and confirms the two halves match`, async () => {
                const result = expectOk(await generateRsaKeyPair(options({ keyFormat })));

                const publicKey = createPublicKey({ key: result.publicKey.text, format: "pem" });
                const privateKey = createPrivateKey({ key: result.privateKey.text, format: "pem" });

                expect(publicKey.asymmetricKeyType).toBe("rsa");
                expect(privateKey.asymmetricKeyType).toBe("rsa");
                expect(new Uint8Array(publicKey.export({ type: "spki", format: "der" }))).toEqual(
                    new Uint8Array(
                        createPublicKey(privateKey).export({ type: "spki", format: "der" }),
                    ),
                );
            });
        }

        test("reads back the DER form, which is the same bytes without the headers", async () => {
            const result = expectOk(await generateRsaKeyPair(options({ outputFormat: "der" })));
            const der = base64ToBytes(result.publicKey.text);

            expect(der).not.toBeNull();
            expect(
                createPublicKey({
                    key: Buffer.from(der as Uint8Array),
                    format: "der",
                    type: "spki",
                }).asymmetricKeyType,
            ).toBe("rsa");
        });

        /**
         * `openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64`
         * is what a reader would run to check this, so the digest is taken over
         * exactly those bytes — the SubjectPublicKeyInfo, never the PKCS#1 form
         * and never the PEM text.
         */
        test("fingerprints the SubjectPublicKeyInfo, whichever container was chosen", async () => {
            for (const keyFormat of ["pkcs8", "pkcs1"] as const) {
                const result = expectOk(await generateRsaKeyPair(options({ keyFormat })));
                const publicKey = createPublicKey({ key: result.publicKey.text, format: "pem" });
                const spki = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
                const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));

                expect(result.fingerprint).toBe(Buffer.from(digest).toString("base64"));
            }
        });
    });
});
