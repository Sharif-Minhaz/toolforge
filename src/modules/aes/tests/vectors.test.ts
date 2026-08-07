import { describe, expect, test } from "bun:test";

import { runAes } from "../domain/crypt";
import { resolveAesKey } from "../domain/key";
import { AES_KEY_SIZES, GCM_TAG_LENGTHS, type AesKeySize, type GcmTagLength } from "../types";
import { request, supportsKeySize } from "./factory";

/**
 * Cross-verification against something that is not us.
 *
 * Every constant below is a published test vector, and every one was
 * re-computed through `node:crypto` — OpenSSL, an implementation with nothing
 * in common with the Web Crypto engine under test — before being pinned here.
 * Neither of those is our own arithmetic, which is the whole point: this tool
 * writes bytes somebody else has to be able to read.
 *
 * - CBC and CTR: NIST SP 800-38A, appendices F.2 and F.5.
 * - GCM: the test cases from McGrew and Viega's GCM specification.
 * - PBKDF2-HMAC-SHA256: the published `password`/`salt` and `passwd`/`salt`
 *   vectors, plus three widths computed with `crypto.pbkdf2Sync`.
 */

/** The four-block plaintext every SP 800-38A appendix uses. */
const NIST_PLAINTEXT =
    "6bc1bee22e409f96e93d7e117393172a" +
    "ae2d8a571e03ac9c9eb76fac45af8e51" +
    "30c81c46a35ce411e5fbc1191a0a52ef" +
    "f69f2445df4f9b17ad2b417be66c3710";

const NIST_KEYS: Record<AesKeySize, string> = {
    128: "2b7e151628aed2a6abf7158809cf4f3c",
    192: "8e73b0f7da0e6452c810f32b809079e562f8ead2522c6b7b",
    256: "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
};

const CBC_IV = "000102030405060708090a0b0c0d0e0f";

const CBC_CIPHERTEXTS: Record<AesKeySize, string> = {
    128:
        "7649abac8119b246cee98e9b12e9197d" +
        "5086cb9b507219ee95db113a917678b2" +
        "73bed6b8e3c1743b7116e69e22229516" +
        "3ff1caa1681fac09120eca307586e1a7",
    192:
        "4f021db243bc633d7178183a9fa071e8" +
        "b4d9ada9ad7dedf4e5e738763f69145a" +
        "571b242012fb7ae07fa9baac3df102e0" +
        "08b0e27988598881d920a9e64f5615cd",
    256:
        "f58c4c04d6e5f1ba779eabfb5f7bfbd6" +
        "9cfc4e967edb808d679f777bc6702c7d" +
        "39f23369a9d9bacfa530e26304231461" +
        "b2eb05e2c39be9fcda6c19078c6a9d1b",
};

const CTR_COUNTER = "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff";

const CTR_CIPHERTEXTS: Record<AesKeySize, string> = {
    128:
        "874d6191b620e3261bef6864990db6ce" +
        "9806f66b7970fdff8617187bb9fffdff" +
        "5ae4df3edbd5d35e5b4f09020db03eab" +
        "1e031dda2fbe03d1792170a0f3009cee",
    192:
        "1abc932417521ca24f2b0459fe7e6e0b" +
        "090339ec0aa6faefd5ccc2c6f4ce8e94" +
        "1e36b26bd1ebc670d1bd1d665620abf7" +
        "4f78a7f6d29809585a97daec58c6b050",
    256:
        "601ec313775789a5b7a7f504bbf3d228" +
        "f443e3ca4d62b59aca84e990cacaf5c5" +
        "2b0930daa23de94ce87017ba2d84988d" +
        "dfc9c58db67aada613c2dd08457941a6",
};

/** The 60-byte plaintext shared by GCM test cases 3, 9 and 15. */
const GCM_PLAINTEXT =
    "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72" +
    "1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39";

const GCM_IV = "cafebabefacedbaddecaf888";

/** Web Crypto returns the ciphertext with the 16-byte tag already appended. */
const GCM_CASES = [
    {
        name: "case 2, AES-128, one zero block",
        keySize: 128,
        key: "00000000000000000000000000000000",
        iv: "000000000000000000000000",
        plaintext: "00000000000000000000000000000000",
        expected: "0388dace60b6a392f328c2b971b2fe78ab6e47d42cec13bdf53a67b21257bddf",
    },
    {
        name: "case 3, AES-128",
        keySize: 128,
        key: "feffe9928665731c6d6a8f9467308308",
        iv: GCM_IV,
        plaintext: GCM_PLAINTEXT,
        expected:
            "42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e" +
            "21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091" +
            "cc15abcc191161501aabab46b8fbac85",
    },
    {
        name: "case 9, AES-192",
        keySize: 192,
        key: "feffe9928665731c6d6a8f9467308308feffe9928665731c",
        iv: GCM_IV,
        plaintext: GCM_PLAINTEXT,
        expected:
            "3980ca0b3c00e841eb06fac4872a2757859e1ceaa6efd984628593b40ca1e19c" +
            "7d773d00c144c525ac619d18c84a3f4718e2448b2fe324d9ccda2710" +
            "aef411c323632dacd1f5e9162f83edec",
    },
    {
        name: "case 15, AES-256",
        keySize: 256,
        key: "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308",
        iv: GCM_IV,
        plaintext: GCM_PLAINTEXT,
        expected:
            "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa" +
            "8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662" +
            "eb9f796c8d356fc31a8433884b696f4f",
    },
] as const satisfies readonly {
    name: string;
    keySize: AesKeySize;
    key: string;
    iv: string;
    plaintext: string;
    expected: string;
}[];

describe("NIST SP 800-38A, CBC", () => {
    for (const keySize of AES_KEY_SIZES) {
        test(`AES-${keySize} produces the published ciphertext blocks`, async () => {
            const result = await runAes(
                request({
                    input: NIST_PLAINTEXT,
                    secret: NIST_KEYS[keySize],
                    options: {
                        mode: "cbc",
                        keySize,
                        keySource: "hex",
                        ivHex: CBC_IV,
                        textEncoding: "hex",
                        cipherEncoding: "hex",
                    },
                }),
            );

            if (!(await supportsKeySize(keySize))) {
                expect(result).toEqual({ ok: false, reason: "unsupported_key_size" });

                return;
            }

            expect(result.ok).toBe(true);

            if (!result.ok) {
                return;
            }

            // The vectors cover four blocks of unpadded plaintext. Web Crypto
            // always applies PKCS#7, so a fifth block of padding follows — and
            // CBC chaining means the first four are unaffected by it.
            expect(result.output.startsWith(CBC_CIPHERTEXTS[keySize])).toBe(true);
            expect(result.output).toHaveLength(160);
        });
    }
});

describe("NIST SP 800-38A, CTR", () => {
    for (const keySize of AES_KEY_SIZES) {
        test(`AES-${keySize} produces the published keystream`, async () => {
            const result = await runAes(
                request({
                    input: NIST_PLAINTEXT,
                    secret: NIST_KEYS[keySize],
                    options: {
                        mode: "ctr",
                        keySize,
                        keySource: "hex",
                        ivHex: CTR_COUNTER,
                        textEncoding: "hex",
                        cipherEncoding: "hex",
                    },
                }),
            );

            if (!(await supportsKeySize(keySize))) {
                expect(result).toEqual({ ok: false, reason: "unsupported_key_size" });

                return;
            }

            // CTR is a stream cipher, so there is no padding and the match is
            // exact rather than a prefix.
            expect(result).toMatchObject({
                ok: true,
                output: CTR_CIPHERTEXTS[keySize],
                inputBytes: 64,
                outputBytes: 64,
            });
        });
    }
});

describe("GCM specification test cases", () => {
    for (const testCase of GCM_CASES) {
        test(`${testCase.name} produces the published ciphertext and tag`, async () => {
            const result = await runAes(
                request({
                    input: testCase.plaintext,
                    secret: testCase.key,
                    options: {
                        mode: "gcm",
                        keySize: testCase.keySize,
                        keySource: "hex",
                        ivHex: testCase.iv,
                        textEncoding: "hex",
                        cipherEncoding: "hex",
                    },
                }),
            );

            if (!(await supportsKeySize(testCase.keySize))) {
                expect(result).toEqual({ ok: false, reason: "unsupported_key_size" });

                return;
            }

            expect(result.ok && result.output).toBe(testCase.expected);
        });
    }

    /**
     * A shorter tag is a truncation of the full one rather than a different
     * computation — so every width below is the same 128-bit tag cut short.
     * Each was re-computed with `crypto.createCipheriv`'s `authTagLength`
     * before being pinned, which is what makes this an assertion rather than a
     * restatement of what the engine happened to do.
     */
    const CASE_3_TAGS: Record<GcmTagLength, string> = {
        128: "cc15abcc191161501aabab46b8fbac85",
        120: "cc15abcc191161501aabab46b8fbac",
        112: "cc15abcc191161501aabab46b8fb",
        104: "cc15abcc191161501aabab46b8",
        96: "cc15abcc191161501aabab46",
        64: "cc15abcc19116150",
        32: "cc15abcc",
    };

    const CASE_3_CIPHERTEXT =
        "42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e" +
        "21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091";

    for (const tagLength of GCM_TAG_LENGTHS) {
        test(`case 3 truncates its tag correctly at ${tagLength} bits`, async () => {
            const result = await runAes(
                request({
                    input: GCM_PLAINTEXT,
                    secret: "feffe9928665731c6d6a8f9467308308",
                    options: {
                        mode: "gcm",
                        keySize: 128,
                        keySource: "hex",
                        ivHex: GCM_IV,
                        tagLength,
                        textEncoding: "hex",
                        cipherEncoding: "hex",
                    },
                }),
            );

            expect(result.ok && result.output).toBe(CASE_3_CIPHERTEXT + CASE_3_TAGS[tagLength]);
        });
    }

    test("reads its own ciphertext back", async () => {
        const decrypted = await runAes(
            request({
                direction: "decrypt",
                input: GCM_CASES[1].expected,
                secret: GCM_CASES[1].key,
                options: {
                    mode: "gcm",
                    keySize: 128,
                    keySource: "hex",
                    ivHex: GCM_IV,
                    textEncoding: "hex",
                    cipherEncoding: "hex",
                },
            }),
        );

        expect(decrypted).toMatchObject({
            ok: true,
            output: GCM_PLAINTEXT,
            inputBytes: 76,
            outputBytes: 60,
        });
    });
});

describe("PBKDF2-HMAC-SHA256", () => {
    /**
     * The published `password`/`salt` and `passwd`/`salt` vectors run at one
     * iteration, which the workbench's own floor forbids — so they are checked
     * against Web Crypto directly. What they establish is that the parameters
     * this tool chose (HMAC-SHA256, `deriveBits`) are the ones the vectors
     * describe; `resolveAesKey` is then checked against OpenSSL below.
     */
    async function deriveHex(secret: string, salt: string, iterations: number, bits: number) {
        const material = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            "PBKDF2",
            false,
            ["deriveBits"],
        );
        const derived = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: new TextEncoder().encode(salt),
                iterations,
                hash: "SHA-256",
            },
            material,
            bits,
        );

        return [...new Uint8Array(derived)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    test("matches the published 32-byte vector", async () => {
        expect(await deriveHex("password", "salt", 1, 256)).toBe(
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
        );
    });

    test("matches the published 64-byte vector", async () => {
        expect(await deriveHex("passwd", "salt", 1, 512)).toBe(
            "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc" +
                "49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783",
        );
    });

    const SALT = "18446f781c8f697caef3609ac74783f7";

    /** Computed with `crypto.pbkdf2Sync`, not with the engine under test. */
    const DERIVED: Record<AesKeySize, string> = {
        128: "c06933f51789ef4f1ec0e33b24657f16",
        192: "c06933f51789ef4f1ec0e33b24657f16f2f169ede78506df",
        256: "c06933f51789ef4f1ec0e33b24657f16f2f169ede78506df64f35b481db11fd9",
    };

    for (const keySize of AES_KEY_SIZES) {
        test(`derives the OpenSSL-computed ${keySize}-bit key`, async () => {
            const key = await resolveAesKey({
                source: "passphrase",
                secret: "correct horse battery staple",
                saltHex: SALT,
                iterations: 1_000,
                keySize,
            });

            expect(key.ok).toBe(true);

            if (key.ok) {
                expect(
                    [...key.bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
                ).toBe(DERIVED[keySize]);
            }
        });
    }
});
