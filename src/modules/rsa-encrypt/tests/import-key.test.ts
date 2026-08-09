import { describe, expect, test } from "bun:test";

import { importRsaCryptKey } from "../domain/import-key";
import { keyPairText } from "./factory";
import type { RsaKeyImportResult } from "../types";

/**
 * Every container the sibling key generator can write, read back by this tool.
 *
 * The fixtures are not hand-written blocks — they come out of
 * `rsa/domain/generate.ts` itself. That makes this the seam test between the two
 * tools: a reader who generates a key on one page and pastes it into the other
 * is exactly this code path, and a change to either module that breaks it fails
 * here rather than in somebody's browser.
 */

function ok(result: RsaKeyImportResult) {
    expect(result.ok).toBe(true);

    return result as Extract<RsaKeyImportResult, { ok: true }>;
}

describe("reading what the key generator wrote", () => {
    test("takes a PKCS#8 public block", async () => {
        const { publicKey } = await keyPairText("pkcs8", "pem");
        const imported = ok(
            await importRsaCryptKey({
                text: publicKey,
                format: "pem",
                kind: "public",
                want: "public",
                hash: "SHA-256",
            }),
        );

        expect(imported.key.type).toBe("public");
        expect(imported.modulusBits).toBe(1024);
    });

    test("takes a PKCS#8 private block", async () => {
        const { privateKey } = await keyPairText("pkcs8", "pem");
        const imported = ok(
            await importRsaCryptKey({
                text: privateKey,
                format: "pem",
                kind: "private",
                want: "private",
                hash: "SHA-256",
            }),
        );

        expect(imported.key.type).toBe("private");
    });

    /**
     * The container Web Crypto cannot read at all. Without the wrapper in
     * `tools/domain/rsa-der.ts`, both of these are a `DOMException` — which is
     * why the generator offering PKCS#1 output would otherwise have produced
     * keys this tool refused.
     */
    test("takes a PKCS#1 public block, which Web Crypto cannot import unaided", async () => {
        const { publicKey } = await keyPairText("pkcs1", "pem");

        expect(publicKey).toContain("BEGIN RSA PUBLIC KEY");

        const imported = ok(
            await importRsaCryptKey({
                text: publicKey,
                format: "pem",
                kind: "public",
                want: "public",
                hash: "SHA-256",
            }),
        );

        expect(imported.key.type).toBe("public");
    });

    test("takes a PKCS#1 private block for the same reason", async () => {
        const { privateKey } = await keyPairText("pkcs1", "pem");

        expect(privateKey).toContain("BEGIN RSA PRIVATE KEY");
        expect(
            ok(
                await importRsaCryptKey({
                    text: privateKey,
                    format: "pem",
                    kind: "private",
                    want: "private",
                    hash: "SHA-256",
                }),
            ).key.type,
        ).toBe("private");
    });

    test("takes bare base64 DER, in either container, without being told which", async () => {
        for (const keyFormat of ["pkcs8", "pkcs1"] as const) {
            const { publicKey, privateKey } = await keyPairText(keyFormat, "der");

            expect(
                ok(
                    await importRsaCryptKey({
                        text: publicKey,
                        format: "der",
                        kind: "public",
                        want: "public",
                        hash: "SHA-256",
                    }),
                ).key.type,
            ).toBe("public");

            expect(
                ok(
                    await importRsaCryptKey({
                        text: privateKey,
                        format: "der",
                        kind: "private",
                        want: "private",
                        hash: "SHA-256",
                    }),
                ).key.type,
            ).toBe("private");
        }
    });

    test("takes a JWK, whichever hash the generator stamped into its alg", async () => {
        const { publicKey, privateKey } = await keyPairText("pkcs8", "jwk");

        expect(
            ok(
                await importRsaCryptKey({
                    text: publicKey,
                    format: "jwk",
                    kind: "public",
                    want: "public",
                    hash: "SHA-512",
                }),
            ).key.type,
        ).toBe("public");

        expect(
            ok(
                await importRsaCryptKey({
                    text: privateKey,
                    format: "jwk",
                    kind: "private",
                    want: "private",
                    hash: "SHA-256",
                }),
            ).key.type,
        ).toBe("private");
    });

    /** A block copied out of a terminal carries the prompt above it. */
    test("ignores whatever was selected around a PEM block", async () => {
        const { publicKey } = await keyPairText("pkcs8", "pem");

        expect(
            ok(
                await importRsaCryptKey({
                    text: `$ cat public.pem\n${publicKey}\n\n`,
                    format: "pem",
                    kind: "public",
                    want: "public",
                    hash: "SHA-256",
                }),
            ).key.type,
        ).toBe("public");
    });
});

describe("deriving the half that was not pasted", () => {
    /**
     * Somebody encrypting who has only the private key should not have to go
     * and extract the public one first.
     */
    test("encrypts with the public half of a pasted private key", async () => {
        const { privateKey } = await keyPairText("pkcs8", "pem");
        const imported = ok(
            await importRsaCryptKey({
                text: privateKey,
                format: "pem",
                kind: "private",
                want: "public",
                hash: "SHA-256",
            }),
        );

        expect(imported.key.type).toBe("public");
        expect(imported.key.usages).toEqual(["encrypt"]);
        expect(imported.modulusBits).toBe(1024);
    });

    test("derives it from a JWK too", async () => {
        const { privateKey } = await keyPairText("pkcs8", "jwk");

        expect(
            ok(
                await importRsaCryptKey({
                    text: privateKey,
                    format: "jwk",
                    kind: "private",
                    want: "public",
                    hash: "SHA-256",
                }),
            ).key.type,
        ).toBe("public");
    });

    /**
     * The impossible direction. A public key carries the modulus and the public
     * exponent and nothing else — there is no private exponent in it to find.
     */
    test("refuses to decrypt with a public key, by name", async () => {
        const { publicKey } = await keyPairText("pkcs8", "pem");

        expect(
            await importRsaCryptKey({
                text: publicKey,
                format: "pem",
                kind: "public",
                want: "private",
                hash: "SHA-256",
            }),
        ).toEqual({ ok: false, reason: "wrong_key_kind", foundKind: "public" });
    });
});

describe("refusals", () => {
    test("names an empty box rather than calling it unreadable", async () => {
        for (const text of ["", "   \n  "]) {
            expect(
                await importRsaCryptKey({
                    text,
                    format: "pem",
                    kind: "public",
                    want: "public",
                    hash: "SHA-256",
                }),
            ).toEqual({ ok: false, reason: "no_key" });
        }
    });

    /** The commonest mistake on this page: the right key, the wrong toggle. */
    test("names the half it actually found when the toggle disagrees", async () => {
        const { privateKey } = await keyPairText("pkcs8", "pem");

        expect(
            await importRsaCryptKey({
                text: privateKey,
                format: "pem",
                kind: "public",
                want: "public",
                hash: "SHA-256",
            }),
        ).toEqual({ ok: false, reason: "wrong_key_kind", foundKind: "private" });
    });

    test("does the same for a JWK, read from whether the private exponent is there", async () => {
        const { publicKey } = await keyPairText("pkcs8", "jwk");

        expect(
            await importRsaCryptKey({
                text: publicKey,
                format: "jwk",
                kind: "private",
                want: "private",
                hash: "SHA-256",
            }),
        ).toEqual({ ok: false, reason: "wrong_key_kind", foundKind: "public" });
    });

    test("names text that is not a key in the declared format", async () => {
        const cases = [
            { text: "not a key at all", format: "pem" },
            { text: "-----BEGIN CERTIFICATE-----\nMAM=\n-----END CERTIFICATE-----", format: "pem" },
            { text: "!!!!not base64!!!!", format: "der" },
            { text: "{ not json", format: "jwk" },
            { text: '{ "kty": "EC", "crv": "P-256" }', format: "jwk" },
            { text: "[]", format: "jwk" },
        ] as const;

        for (const { text, format } of cases) {
            expect(
                await importRsaCryptKey({
                    text,
                    format,
                    kind: "public",
                    want: "public",
                    hash: "SHA-256",
                }),
            ).toEqual({ ok: false, reason: "unreadable_key" });
        }
    });

    /**
     * Parsed, said what it was, and Web Crypto still would not take it — which
     * is a different problem from "this is not a key", and keeps its own name.
     */
    test("names a block that parses but is not a usable key", async () => {
        expect(
            await importRsaCryptKey({
                text: "-----BEGIN PUBLIC KEY-----\nMAMCAQA=\n-----END PUBLIC KEY-----",
                format: "pem",
                kind: "public",
                want: "public",
                hash: "SHA-256",
            }),
        ).toEqual({ ok: false, reason: "key_rejected" });
    });

    test("refuses a key box far past the ceiling instead of parsing it", async () => {
        expect(
            await importRsaCryptKey({
                text: "A".repeat(20_000),
                format: "der",
                kind: "public",
                want: "public",
                hash: "SHA-256",
            }),
        ).toEqual({ ok: false, reason: "unreadable_key" });
    });
});
