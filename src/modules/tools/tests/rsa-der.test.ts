import { describe, expect, test } from "bun:test";
import { createPrivateKey, createPublicKey } from "node:crypto";

import {
    readModulusBits,
    readPublicExponent,
    unwrapPkcs8,
    unwrapSpki,
    wrapPkcs1AsPkcs8,
    wrapPkcs1AsSpki,
} from "../domain/rsa-der";
import { toPem } from "../domain/pem";
import type { CipherBytes } from "../types";

/**
 * The cross-check this module exists for.
 *
 * `der.ts` claims that the PKCS#1 structure inside an SPKI or a PKCS#8 block can
 * be lifted out verbatim — that unwrapping is not re-encoding, and the bytes it
 * produces are the bytes OpenSSL would have written. That is a claim about
 * somebody else's reader, so it is checked against somebody else's reader:
 * `node:crypto`, which is a completely separate ASN.1 implementation with its
 * own PKCS#1 parser and its own DER writer.
 *
 * A test that only fed these bytes back to Web Crypto would prove nothing, since
 * Web Crypto cannot read PKCS#1 at all — that is the whole reason this file
 * exists.
 */

const RSA_OAEP = { name: "RSA-OAEP", hash: "SHA-256" } as const;

/** Fails the test rather than casting, so a `null` is a red test and not a throw. */
function bytes(value: CipherBytes | null): CipherBytes {
    expect(value).not.toBeNull();

    return value as CipherBytes;
}

async function generate(modulusLength: number, publicExponent = new Uint8Array([1, 0, 1])) {
    const pair = await crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength, publicExponent, hash: "SHA-256" },
        true,
        ["sign", "verify"],
    );

    return {
        spki: new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)),
        pkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
    };
}

describe("unwrapping a container", () => {
    test("lifts a PKCS#1 public key that node:crypto re-exports to the same SPKI", async () => {
        const { spki } = await generate(1024);
        const pkcs1 = bytes(unwrapSpki(spki));
        const reread = createPublicKey({
            key: toPem("RSA PUBLIC KEY", pkcs1),
            format: "pem",
        });

        expect(new Uint8Array(reread.export({ type: "spki", format: "der" }))).toEqual(spki);
    });

    test("lifts a PKCS#1 private key that node:crypto re-exports to the same PKCS#8", async () => {
        const { pkcs8 } = await generate(1024);
        const pkcs1 = bytes(unwrapPkcs8(pkcs8));
        const reread = createPrivateKey({
            key: toPem("RSA PRIVATE KEY", pkcs1),
            format: "pem",
        });

        expect(new Uint8Array(reread.export({ type: "pkcs8", format: "der" }))).toEqual(pkcs8);
    });

    /**
     * The stronger form of the same claim: node:crypto's own PKCS#1 writer,
     * asked for the structure directly, produces byte-for-byte what the
     * unwrapper lifted out.
     */
    test("produces exactly the bytes node:crypto's own PKCS#1 writer does", async () => {
        const { spki, pkcs8 } = await generate(1024);

        const publicKey = createPublicKey({ key: toPem("PUBLIC KEY", spki), format: "pem" });
        const privateKey = createPrivateKey({ key: toPem("PRIVATE KEY", pkcs8), format: "pem" });

        expect(unwrapSpki(spki)).toEqual(
            new Uint8Array(publicKey.export({ type: "pkcs1", format: "der" })),
        );
        expect(unwrapPkcs8(pkcs8)).toEqual(
            new Uint8Array(privateKey.export({ type: "pkcs1", format: "der" })),
        );
    });

    test("refuses a truncated container instead of throwing", () => {
        const { buffer } = new Uint8Array([0x30, 0x82, 0x01, 0x00]);

        expect(unwrapSpki(new Uint8Array(buffer))).toBeNull();
        expect(unwrapPkcs8(new Uint8Array(buffer))).toBeNull();
    });

    test("refuses an empty input", () => {
        expect(unwrapSpki(new Uint8Array())).toBeNull();
        expect(unwrapPkcs8(new Uint8Array())).toBeNull();
    });

    test("refuses a structure whose outer tag is not a SEQUENCE", () => {
        expect(unwrapSpki(new Uint8Array([0x04, 0x02, 0x00, 0x00]))).toBeNull();
        expect(unwrapPkcs8(new Uint8Array([0x04, 0x02, 0x00, 0x00]))).toBeNull();
    });

    /**
     * An `EncryptedPrivateKeyInfo` opens with a SEQUENCE where a `PrivateKeyInfo`
     * opens with an INTEGER version. Mistaking one for the other would hand back
     * a passphrase-wrapped blob under a `RSA PRIVATE KEY` header.
     */
    test("refuses a PrivateKeyInfo whose first field is not a version integer", () => {
        const encrypted = new Uint8Array([0x30, 0x06, 0x30, 0x04, 0x04, 0x02, 0x00, 0x00]);

        expect(unwrapPkcs8(encrypted)).toBeNull();
    });
});

describe("reading the key back", () => {
    test("reports the modulus width the key was asked for", async () => {
        for (const bits of [1024, 2048]) {
            const { spki } = await generate(bits);

            expect(readModulusBits(bytes(unwrapSpki(spki)))).toBe(bits);
        }
    });

    /**
     * The leading-zero trap. A DER INTEGER is signed, so a modulus with its top
     * bit set — about half of them — carries a padding byte that is not
     * magnitude. Counting it reports 2056 for a 2048-bit key. Ten keys is enough
     * that a reader that got this wrong would fail essentially every run.
     */
    test("never counts the sign-padding byte as part of the modulus", async () => {
        const widths = await Promise.all(
            Array.from({ length: 10 }, async () => {
                const { spki } = await generate(1024);

                return readModulusBits(bytes(unwrapSpki(spki)));
            }),
        );

        expect(widths).toEqual(Array.from({ length: 10 }, () => 1024));
    });

    test("reads the public exponent back out of the key", async () => {
        for (const [value, exponent] of [
            [65_537, new Uint8Array([1, 0, 1])],
            [3, new Uint8Array([3])],
        ] as const) {
            const { spki } = await generate(1024, exponent);

            expect(readPublicExponent(bytes(unwrapSpki(spki)))).toBe(value);
        }
    });

    test("refuses to read fields out of something that is not an RSAPublicKey", () => {
        expect(readModulusBits(new Uint8Array([0x30, 0x00]))).toBeNull();
        expect(readPublicExponent(new Uint8Array([0x30, 0x00]))).toBeNull();
    });
});

/**
 * The writer, checked the same way the reader is: against `node:crypto`, which
 * has its own DER encoder and its own opinion about what these containers look
 * like. A wrapper checked only by feeding it back to its own unwrapper would
 * agree with itself about a length encoding nobody else accepts.
 */
describe("wrapping a PKCS#1 structure back up", () => {
    test("rebuilds the exact SPKI the key came out of", async () => {
        const { spki } = await generate(1024);
        const pkcs1 = bytes(unwrapSpki(spki));

        expect(wrapPkcs1AsSpki(pkcs1)).toEqual(spki);
    });

    test("rebuilds the exact PKCS#8 the key came out of", async () => {
        const { pkcs8 } = await generate(1024);
        const pkcs1 = bytes(unwrapPkcs8(pkcs8));

        expect(wrapPkcs1AsPkcs8(pkcs1)).toEqual(pkcs8);
    });

    /**
     * The length-encoding boundary. A 1024-bit key's inner structures are long
     * enough to need two length bytes and a 4096-bit key's need three, so both
     * sides of the short-form cutoff and both long-form widths are exercised.
     */
    test("encodes lengths the way every other writer does, at every width", async () => {
        for (const bits of [1024, 2048, 4096]) {
            const { spki, pkcs8 } = await generate(bits);

            expect(wrapPkcs1AsSpki(bytes(unwrapSpki(spki)))).toEqual(spki);
            expect(wrapPkcs1AsPkcs8(bytes(unwrapPkcs8(pkcs8)))).toEqual(pkcs8);
        }
    }, 30_000);

    test("produces a public block node:crypto reads as the same key", async () => {
        const { spki } = await generate(1024);
        const rebuilt = wrapPkcs1AsSpki(bytes(unwrapSpki(spki)));
        const key = createPublicKey({ key: toPem("PUBLIC KEY", rebuilt), format: "pem" });

        expect(key.asymmetricKeyType).toBe("rsa");
        expect(new Uint8Array(key.export({ type: "spki", format: "der" }))).toEqual(spki);
    });

    test("produces a private block node:crypto reads as the same key", async () => {
        const { pkcs8 } = await generate(1024);
        const rebuilt = wrapPkcs1AsPkcs8(bytes(unwrapPkcs8(pkcs8)));
        const key = createPrivateKey({ key: toPem("PRIVATE KEY", rebuilt), format: "pem" });

        expect(new Uint8Array(key.export({ type: "pkcs8", format: "der" }))).toEqual(pkcs8);
    });

    /**
     * The point of the writer: Web Crypto cannot read PKCS#1 at all, so a key
     * pasted in that form is unusable until it has been wrapped. This is the
     * whole feature, in one assertion.
     */
    test("makes a PKCS#1 key importable by Web Crypto, which cannot read one", async () => {
        const { spki } = await generate(1024);
        const pkcs1 = bytes(unwrapSpki(spki));

        await expect(
            crypto.subtle.importKey("spki", pkcs1, RSA_OAEP, false, ["encrypt"]),
        ).rejects.toThrow();

        const imported = await crypto.subtle.importKey(
            "spki",
            wrapPkcs1AsSpki(pkcs1),
            RSA_OAEP,
            false,
            ["encrypt"],
        );

        expect(imported.type).toBe("public");
    });
});
