import { describe, expect, test } from "bun:test";

import {
    isKeyInputFormat,
    isRsaCryptHash,
    isRsaKeyKind,
    isRsaPadding,
    keyKindApplies,
    requiredKeyKind,
} from "../domain/options";
import { rsaCryptOptionsSchema, rsaCryptSearchParamsSchema } from "../validation/rsa-crypt-options";
import { options } from "./factory";

describe("keyKindApplies", () => {
    /** A public key cannot decrypt: the private exponent is not in it. */
    test("is false under decrypt, where only one half can work", () => {
        expect(keyKindApplies("decrypt")).toBe(false);
        expect(keyKindApplies("encrypt")).toBe(true);
    });
});

describe("requiredKeyKind", () => {
    test("honours the toggle while encrypting", () => {
        expect(requiredKeyKind("encrypt", "public")).toBe("public");
        expect(requiredKeyKind("encrypt", "private")).toBe("private");
    });

    /** Forced rather than merely disabled, so a stale link cannot slip past. */
    test("forces the private half while decrypting, whatever was selected", () => {
        expect(requiredKeyKind("decrypt", "public")).toBe("private");
        expect(requiredKeyKind("decrypt", "private")).toBe("private");
    });
});

describe("type guards", () => {
    test("accept the offered values and reject the rest", () => {
        expect(isKeyInputFormat("jwk")).toBe(true);
        expect(isKeyInputFormat("openssh")).toBe(false);
        expect(isRsaKeyKind("private")).toBe(true);
        expect(isRsaKeyKind("secret")).toBe(false);
        expect(isRsaCryptHash("SHA-384")).toBe(true);
        expect(isRsaCryptHash("SHA-1")).toBe(false);
    });

    /**
     * The padding guard exists to keep one value from becoming two by accident.
     * RSAES-PKCS1-v1_5 is not in Web Crypto and no browser implements it.
     */
    test("knows OAEP is the only padding on offer", () => {
        expect(isRsaPadding("oaep")).toBe(true);
        expect(isRsaPadding("pkcs1")).toBe(false);
        expect(isRsaPadding("pkcs1-v1_5")).toBe(false);
    });
});

describe("rsaCryptOptionsSchema", () => {
    test("accepts the workbench's own option set", () => {
        expect(rsaCryptOptionsSchema.safeParse(options()).success).toBe(true);
    });

    test("refuses a padding scheme the platform does not have", () => {
        expect(
            rsaCryptOptionsSchema.safeParse({ ...options(), padding: "pkcs1-v1_5" }).success,
        ).toBe(false);
    });

    test("refuses UTF-8 on the ciphertext side, which was never text", () => {
        expect(
            rsaCryptOptionsSchema.safeParse({ ...options(), cipherEncoding: "utf-8" }).success,
        ).toBe(false);
    });
});

describe("rsaCryptSearchParamsSchema", () => {
    test("reads a link that names every option", () => {
        expect(
            rsaCryptSearchParamsSchema.parse({
                direction: "decrypt",
                keyFormat: "jwk",
                keyKind: "private",
                hash: "SHA-512",
                textEncoding: "hex",
                cipherEncoding: "hex",
            }),
        ).toEqual({
            direction: "decrypt",
            keyFormat: "jwk",
            keyKind: "private",
            hash: "SHA-512",
            textEncoding: "hex",
            cipherEncoding: "hex",
        });
    });

    /** One malformed value degrades to a default rather than throwing the page away. */
    test("drops only the field that was wrong", () => {
        const parsed = rsaCryptSearchParamsSchema.parse({
            direction: "sideways",
            hash: "SHA-384",
            cipherEncoding: "utf-8",
        });

        expect(parsed.direction).toBeUndefined();
        expect(parsed.cipherEncoding).toBeUndefined();
        expect(parsed.hash).toBe("SHA-384");
    });

    /**
     * Nothing that could carry key material or a plaintext has a parameter at
     * all — a URL lands in history, in access logs and in the `Referer` header
     * of every outbound link on the page.
     */
    test("has no parameter for the key or the payload", () => {
        const parsed = rsaCryptSearchParamsSchema.parse({
            key: "-----BEGIN PRIVATE KEY-----",
            input: "secret",
            text: "secret",
        });

        expect(Object.values(parsed).every((value) => value === undefined)).toBe(true);
    });
});
