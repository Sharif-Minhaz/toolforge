import { describe, expect, test } from "bun:test";
import { createPrivateKey, createPublicKey } from "node:crypto";

import { readModulusBits, readPublicExponent, unwrapPkcs8, unwrapSpki } from "../domain/der";
import { toPem } from "../domain/pem";

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
        const pkcs1 = unwrapSpki(spki);

        expect(pkcs1).not.toBeNull();

        const reread = createPublicKey({
            key: toPem("RSA PUBLIC KEY", pkcs1 as Uint8Array),
            format: "pem",
        });

        expect(new Uint8Array(reread.export({ type: "spki", format: "der" }))).toEqual(spki);
    });

    test("lifts a PKCS#1 private key that node:crypto re-exports to the same PKCS#8", async () => {
        const { pkcs8 } = await generate(1024);
        const pkcs1 = unwrapPkcs8(pkcs8);

        expect(pkcs1).not.toBeNull();

        const reread = createPrivateKey({
            key: toPem("RSA PRIVATE KEY", pkcs1 as Uint8Array),
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

            expect(readModulusBits(unwrapSpki(spki) as Uint8Array)).toBe(bits);
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

                return readModulusBits(unwrapSpki(spki) as Uint8Array);
            }),
        );

        expect(widths).toEqual(Array.from({ length: 10 }, () => 1024));
    });

    test("reads the public exponent back out of the key", async () => {
        for (const [value, bytes] of [
            [65_537, new Uint8Array([1, 0, 1])],
            [3, new Uint8Array([3])],
        ] as const) {
            const { spki } = await generate(1024, bytes);

            expect(readPublicExponent(unwrapSpki(spki) as Uint8Array)).toBe(value);
        }
    });

    test("refuses to read fields out of something that is not an RSAPublicKey", () => {
        expect(readModulusBits(new Uint8Array([0x30, 0x00]))).toBeNull();
        expect(readPublicExponent(new Uint8Array([0x30, 0x00]))).toBeNull();
    });
});
