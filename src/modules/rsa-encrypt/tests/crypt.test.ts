import { describe, expect, test } from "bun:test";
import {
    createPrivateKey,
    createPublicKey,
    privateDecrypt,
    publicEncrypt,
    constants,
} from "node:crypto";

import { base64ToBytes } from "@/modules/tools/domain/base64";
import { inputCeilingFor, runRsaCrypt, supportsPlaintextEncoding } from "../domain/crypt";
import { keyPairText, options } from "./factory";
import type { RsaCryptResult, RsaCryptSuccess } from "../types";

function ok(result: RsaCryptResult): RsaCryptSuccess {
    expect(result.ok).toBe(true);

    return result as RsaCryptSuccess;
}

const text = (value: string) => ({ kind: "text", text: value }) as const;

describe("runRsaCrypt", () => {
    test("encrypts with a public key and decrypts it back with the private one", async () => {
        const keys = await keyPairText();

        const encrypted = ok(
            await runRsaCrypt({
                direction: "encrypt",
                source: text("hello"),
                keyText: keys.publicKey,
                options: options(),
            }),
        );

        const decrypted = ok(
            await runRsaCrypt({
                direction: "decrypt",
                source: text(encrypted.output),
                keyText: keys.privateKey,
                options: options({ keyKind: "private" }),
            }),
        );

        expect(decrypted.output).toBe("hello");
        expect(decrypted.modulusBits).toBe(1024);
    });

    /**
     * RSA does not stream. Whatever the message, one operation produces exactly
     * one modulus-wide block — which is the thing that surprises people most
     * about this page, and is asserted rather than described.
     */
    test("always produces exactly one modulus-wide block, whatever the message", async () => {
        const keys = await keyPairText();

        // An empty box is refused before the cipher, so one character is the
        // shortest message that ever reaches it.
        for (const message of ["a", "x".repeat(60)]) {
            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text(message),
                    keyText: keys.publicKey,
                    options: options(),
                }),
            );

            expect(encrypted.inputBytes).toBe(message.length);
            expect(encrypted.outputBytes).toBe(128);
        }
    });

    test("round-trips through every container the generator can write", async () => {
        for (const [keyFormat, outputFormat] of [
            ["pkcs8", "pem"],
            ["pkcs1", "pem"],
            ["pkcs8", "der"],
            ["pkcs8", "jwk"],
        ] as const) {
            const keys = await keyPairText(keyFormat, outputFormat);
            const keyOptions = options({
                keyFormat: outputFormat === "jwk" ? "jwk" : outputFormat,
            });

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("round trip"),
                    keyText: keys.publicKey,
                    options: keyOptions,
                }),
            );

            const decrypted = ok(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(encrypted.output),
                    keyText: keys.privateKey,
                    options: { ...keyOptions, keyKind: "private" },
                }),
            );

            expect(decrypted.output).toBe("round trip");
        }
    });

    test("encrypts with the public half of a private key when that is all there is", async () => {
        const keys = await keyPairText();

        const encrypted = ok(
            await runRsaCrypt({
                direction: "encrypt",
                source: text("only the private half"),
                keyText: keys.privateKey,
                options: options({ keyKind: "private" }),
            }),
        );

        const decrypted = ok(
            await runRsaCrypt({
                direction: "decrypt",
                source: text(encrypted.output),
                keyText: keys.privateKey,
                options: options({ keyKind: "private" }),
            }),
        );

        expect(decrypted.output).toBe("only the private half");
    });

    describe("encodings", () => {
        test("reads the plaintext in whichever encoding the picker says", async () => {
            const keys = await keyPairText();

            for (const [textEncoding, written] of [
                ["utf-8", "hi"],
                ["hex", "6869"],
                ["base64", "aGk="],
            ] as const) {
                const encrypted = ok(
                    await runRsaCrypt({
                        direction: "encrypt",
                        source: text(written),
                        keyText: keys.publicKey,
                        options: options({ textEncoding }),
                    }),
                );

                const decrypted = ok(
                    await runRsaCrypt({
                        direction: "decrypt",
                        source: text(encrypted.output),
                        keyText: keys.privateKey,
                        options: options({ keyKind: "private", textEncoding: "utf-8" }),
                    }),
                );

                expect(decrypted.output).toBe("hi");
            }
        });

        test("writes the ciphertext as hex or base64, and reads either back", async () => {
            const keys = await keyPairText();

            for (const cipherEncoding of ["hex", "base64"] as const) {
                const encrypted = ok(
                    await runRsaCrypt({
                        direction: "encrypt",
                        source: text("either way"),
                        keyText: keys.publicKey,
                        options: options({ cipherEncoding }),
                    }),
                );

                expect(encrypted.output).toMatch(
                    cipherEncoding === "hex" ? /^[0-9a-f]{256}$/ : /^[A-Za-z0-9+/]+=*$/,
                );

                const decrypted = ok(
                    await runRsaCrypt({
                        direction: "decrypt",
                        source: text(encrypted.output),
                        keyText: keys.privateKey,
                        options: options({ keyKind: "private", cipherEncoding }),
                    }),
                );

                expect(decrypted.output).toBe("either way");
            }
        });

        test("encrypts an opened file as the bytes it is", async () => {
            const keys = await keyPairText();
            const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x41]);

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: { kind: "file", name: "blob.bin", bytes },
                    keyText: keys.publicKey,
                    options: options(),
                }),
            );

            const decrypted = ok(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(encrypted.output),
                    keyText: keys.privateKey,
                    options: options({ keyKind: "private", textEncoding: "hex" }),
                }),
            );

            expect(decrypted.output).toBe("fffe0041");
        });
    });

    describe("refusals", () => {
        test("names an empty payload separately from an empty key", async () => {
            const keys = await keyPairText();

            expect(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text(""),
                    keyText: keys.publicKey,
                    options: options(),
                }),
            ).toEqual({ ok: false, reason: "no_input" });

            expect(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("hi"),
                    keyText: "",
                    options: options(),
                }),
            ).toEqual({ ok: false, reason: "no_key" });
        });

        /** The key is checked first: its modulus is what a legal message means. */
        test("complains about the key before the payload", async () => {
            expect(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text(""),
                    keyText: "",
                    options: options(),
                }),
            ).toEqual({ ok: false, reason: "no_key" });
        });

        test("quotes the real ceiling when the message is too long", async () => {
            const keys = await keyPairText("pkcs8", "pem", 2048);
            const result = await runRsaCrypt({
                direction: "encrypt",
                source: text("x".repeat(191)),
                keyText: keys.publicKey,
                options: options(),
            });

            expect(result).toEqual({
                ok: false,
                reason: "message_too_long",
                actualBytes: 191,
                limitBytes: 190,
            });
        });

        test("accepts a message exactly at that ceiling", async () => {
            const keys = await keyPairText("pkcs8", "pem", 2048);

            expect(
                ok(
                    await runRsaCrypt({
                        direction: "encrypt",
                        source: text("x".repeat(190)),
                        keyText: keys.publicKey,
                        options: options(),
                    }),
                ).inputBytes,
            ).toBe(190);
        });

        /**
         * A separate reason, because no message fits at all — a 1024-bit key
         * needs 130 bytes of SHA-512 overhead inside a 128-byte modulus. Telling
         * this reader to shorten something would be advice they cannot act on.
         */
        test("names a digest too wide for the key, rather than blaming the message", async () => {
            const keys = await keyPairText();

            expect(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("a"),
                    keyText: keys.publicKey,
                    options: options({ hash: "SHA-512" }),
                }),
            ).toEqual({ ok: false, reason: "hash_too_large_for_key" });
        });

        test("names input that is not the encoding it claims to be", async () => {
            const keys = await keyPairText();

            expect(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("zz"),
                    keyText: keys.publicKey,
                    options: options({ textEncoding: "hex" }),
                }),
            ).toEqual({ ok: false, reason: "invalid_input_encoding" });
        });

        /** OAEP checks its own padding, so this is a real signal, not a shrug. */
        test("names a decryption that did not come from this key", async () => {
            const mine = await keyPairText();
            const theirs = await keyPairText();

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("for me"),
                    keyText: mine.publicKey,
                    options: options(),
                }),
            );

            expect(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(encrypted.output),
                    keyText: theirs.privateKey,
                    options: options({ keyKind: "private" }),
                }),
            ).toEqual({ ok: false, reason: "decryption_failed" });
        });

        test("names a decryption run under a different hash than it was sealed with", async () => {
            const keys = await keyPairText("pkcs8", "pem", 2048);

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("sealed with sha-256"),
                    keyText: keys.publicKey,
                    options: options(),
                }),
            );

            expect(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(encrypted.output),
                    keyText: keys.privateKey,
                    options: options({ keyKind: "private", hash: "SHA-384" }),
                }),
            ).toEqual({ ok: false, reason: "decryption_failed" });
        });

        test("names bytes that decrypted fine but are not text", async () => {
            const keys = await keyPairText();
            const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: { kind: "file", name: "blob.bin", bytes },
                    keyText: keys.publicKey,
                    options: options(),
                }),
            );

            expect(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(encrypted.output),
                    keyText: keys.privateKey,
                    options: options({ keyKind: "private", textEncoding: "utf-8" }),
                }),
            ).toEqual({ ok: false, reason: "undecodable_text" });
        });
    });

    /**
     * The cross-check. `node:crypto` is a different OAEP implementation with its
     * own padding code, so a ciphertext this tool writes has to open there, and
     * one it writes has to open here. Anything less would only prove the tool
     * agrees with itself.
     */
    describe("what somebody else's OAEP makes of it", () => {
        test("node:crypto decrypts what this tool encrypted", async () => {
            const keys = await keyPairText();

            const encrypted = ok(
                await runRsaCrypt({
                    direction: "encrypt",
                    source: text("across implementations"),
                    keyText: keys.publicKey,
                    options: options(),
                }),
            );

            const opened = privateDecrypt(
                {
                    key: createPrivateKey({ key: keys.privateKey, format: "pem" }),
                    padding: constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256",
                },
                Buffer.from(base64ToBytes(encrypted.output) as Uint8Array),
            );

            expect(opened.toString("utf8")).toBe("across implementations");
        });

        test("this tool decrypts what node:crypto encrypted", async () => {
            const keys = await keyPairText();

            const sealed = publicEncrypt(
                {
                    key: createPublicKey({ key: keys.publicKey, format: "pem" }),
                    padding: constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256",
                },
                Buffer.from("the other direction", "utf8"),
            );

            const decrypted = ok(
                await runRsaCrypt({
                    direction: "decrypt",
                    source: text(sealed.toString("base64")),
                    keyText: keys.privateKey,
                    options: options({ keyKind: "private" }),
                }),
            );

            expect(decrypted.output).toBe("the other direction");
        });

        /**
         * OAEP is randomised, so the same message under the same key produces a
         * different block every time. A tool that emitted a stable ciphertext
         * would have got the padding wrong in a way nothing else would catch.
         */
        test("never produces the same ciphertext twice for the same message", async () => {
            const keys = await keyPairText();
            const run = async () =>
                ok(
                    await runRsaCrypt({
                        direction: "encrypt",
                        source: text("same message"),
                        keyText: keys.publicKey,
                        options: options(),
                    }),
                ).output;

            expect(await run()).not.toBe(await run());
        });
    });
});

describe("supportsPlaintextEncoding", () => {
    /** A file's bytes *are* the plaintext, so there is no text to describe. */
    test("is false only while encrypting an opened file", () => {
        const file = { kind: "file", name: "a.bin", bytes: new Uint8Array([1]) } as const;

        expect(supportsPlaintextEncoding("encrypt", file)).toBe(false);
        expect(supportsPlaintextEncoding("decrypt", file)).toBe(true);
        expect(supportsPlaintextEncoding("encrypt", text("hi"))).toBe(true);
    });
});

describe("inputCeilingFor", () => {
    test("measures a file in bytes and a box in characters", () => {
        expect(inputCeilingFor(text("hi"))).toBe(8_192);
        expect(inputCeilingFor({ kind: "file", name: "a", bytes: new Uint8Array() })).toBe(8_192);
    });
});
