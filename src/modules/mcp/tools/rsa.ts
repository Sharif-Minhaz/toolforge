import { z } from "zod";

import { DEFAULT_RSA_OPTIONS } from "@/modules/rsa/domain/constants";
import { generateRsaKeyPair } from "@/modules/rsa/domain/generate";
import { isWeakKeySize } from "@/modules/rsa/domain/options";
import {
    publicExponentSchema,
    rsaHashSchema,
    rsaKeyFormatSchema,
    rsaKeySizeSchema,
    rsaOutputFormatSchema,
    rsaUsageSchema,
} from "@/modules/rsa/validation/rsa-options";
import { runRsaCrypt } from "@/modules/rsa-encrypt/domain/crypt";
import {
    DEFAULT_RSA_CRYPT_OPTIONS,
    MAX_RSA_CRYPT_INPUT_LENGTH,
    MAX_RSA_KEY_LENGTH,
} from "@/modules/rsa-encrypt/domain/constants";
import { maxOaepMessageBytes } from "@/modules/rsa-encrypt/domain/limits";
import {
    payloadBinaryEncodingSchema,
    payloadTextEncodingSchema,
    rsaCryptDirectionSchema,
    rsaCryptHashSchema,
    rsaKeyInputFormatSchema,
    rsaKeyKindSchema,
    rsaPaddingSchema,
} from "@/modules/rsa-encrypt/validation/rsa-crypt-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The two RSA tools together: minting a key pair, and using one.
 *
 * They ship as one adapter file because a caller almost always wants both in
 * sequence — generate, then encrypt with what came back — and the output of the
 * first is literally the input of the second. Keeping them apart would only
 * mean two files agreeing about PEM.
 *
 * Note the key sizes below run down to 1024, which is not a recommendation. The
 * page keeps it for reading old material and marks it weak; the description
 * says the same thing, because a model choosing a size from a list has nothing
 * else to go on.
 */

export const rsaGenerateTool = defineMcpTool({
    toolId: "rsa",
    verb: "generate",
    title: "Generate an RSA key pair",
    description:
        "Generate an RSA key pair and render it as PEM, DER or JWK, in the PKCS#8/SPKI or PKCS#1 container. 2048 bits is the working minimum and 3072 the conservative choice; 1024 is offered only for reading legacy material and is not secure. Returns both halves plus the modulus size, public exponent and a SHA-256 fingerprint. Generation is CPU-bound — 4096 bits can take several seconds.",
    kind: "offline",
    // A key pair is fresh randomness every time.
    readOnly: false,
    inputSchema: z.object({
        keySize: rsaKeySizeSchema.default(DEFAULT_RSA_OPTIONS.keySize),
        usage: rsaUsageSchema
            .default(DEFAULT_RSA_OPTIONS.usage)
            .describe("What the key is for: signing (pkcs1v15/pss) or encryption (oaep)"),
        hash: rsaHashSchema.default(DEFAULT_RSA_OPTIONS.hash),
        keyFormat: rsaKeyFormatSchema
            .default(DEFAULT_RSA_OPTIONS.keyFormat)
            .describe("`pkcs8` pairs with SPKI; `pkcs1` is the older RSA-specific container"),
        outputFormat: rsaOutputFormatSchema.default(DEFAULT_RSA_OPTIONS.outputFormat),
        publicExponent: publicExponentSchema
            .default(DEFAULT_RSA_OPTIONS.publicExponent)
            .describe("65537 unless you have a specific reason"),
    }),
    run: async (options) => {
        const result = await generateRsaKeyPair(options);

        if (!result.ok) {
            return refuseWithReason("RSA generator", result.reason);
        }

        return succeed(`${result.modulusBits}-bit RSA key pair`, {
            publicKey: result.publicKey.text,
            privateKey: result.privateKey.text,
            modulusBits: result.modulusBits,
            exponent: result.exponent,
            fingerprint: result.fingerprint,
            outputFormat: options.outputFormat,
            keyFormat: options.keyFormat,
            weak: isWeakKeySize(options.keySize),
        });
    },
});

export const rsaCryptTool = defineMcpTool({
    toolId: "rsa-encrypt",
    verb: "crypt",
    title: "Encrypt or decrypt with an RSA key",
    description:
        "Encrypt with an RSA public key or decrypt with the private half, using OAEP padding. RSA can only carry a message shorter than its modulus — about 190 bytes at 2048 bits with SHA-256 — so use it for a session key or a short secret, and AES for anything larger. Accepts PEM, DER or JWK keys.",
    kind: "offline",
    inputSchema: z.object({
        direction: rsaCryptDirectionSchema.default("encrypt"),
        text: z
            .string()
            .max(MAX_RSA_CRYPT_INPUT_LENGTH)
            .describe("Plaintext when encrypting, ciphertext when decrypting"),
        keyText: z
            .string()
            .max(MAX_RSA_KEY_LENGTH)
            .describe("The key exactly as it is written — PEM block, base64 DER, or JWK JSON"),
        keyFormat: rsaKeyInputFormatSchema.default(DEFAULT_RSA_CRYPT_OPTIONS.keyFormat),
        keyKind: rsaKeyKindSchema
            .default(DEFAULT_RSA_CRYPT_OPTIONS.keyKind)
            .describe("Forced to `private` when decrypting — a public key cannot undo itself"),
        padding: rsaPaddingSchema.default(DEFAULT_RSA_CRYPT_OPTIONS.padding),
        hash: rsaCryptHashSchema
            .default(DEFAULT_RSA_CRYPT_OPTIONS.hash)
            .describe("OAEP digest. Must match on both sides of a round trip"),
        textEncoding: payloadTextEncodingSchema.default(DEFAULT_RSA_CRYPT_OPTIONS.textEncoding),
        cipherEncoding: payloadBinaryEncodingSchema.default(
            DEFAULT_RSA_CRYPT_OPTIONS.cipherEncoding,
        ),
    }),
    run: async ({ direction, text, keyText, ...options }) => {
        const result = await runRsaCrypt({
            direction,
            source: { kind: "text", text },
            keyText,
            options,
        });

        if (!result.ok) {
            return refuseWithReason("RSA", result.reason, {
                limitBytes: result.limitBytes ?? null,
                actualBytes: result.actualBytes ?? null,
                foundKind: result.foundKind ?? null,
            });
        }

        return succeed(
            `${direction === "encrypt" ? "Encrypted" : "Decrypted"} ${result.inputBytes} bytes with a ${result.modulusBits}-bit key`,
            {
                output: result.output,
                modulusBits: result.modulusBits,
                inputBytes: result.inputBytes,
                outputBytes: result.outputBytes,
                maxMessageBytes: maxOaepMessageBytes(result.modulusBits, options.hash),
            },
        );
    },
});
