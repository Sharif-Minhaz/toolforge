import { z } from "zod";

import { DEFAULT_AES_OPTIONS, MAX_AES_SECRET_LENGTH } from "@/modules/aes/domain/constants";
import { runAes } from "@/modules/aes/domain/crypt";
import { ivBytesFor } from "@/modules/aes/domain/modes";
import { randomIvHex, randomSaltHex } from "@/modules/aes/domain/params";
import {
    aesCipherEncodingSchema,
    aesDirectionSchema,
    aesKeySizeSchema,
    aesKeySourceSchema,
    aesModeSchema,
    aesTextEncodingSchema,
    gcmTagLengthSchema,
    pbkdf2IterationsSchema,
} from "@/modules/aes/validation/aes-options";

import { MAX_MCP_TEXT_LENGTH } from "../domain/constants";
import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * AES in both directions, with the two parameters that decide whether a round
 * trip closes handled explicitly.
 *
 * A salt and an IV are per-message values, and the page draws fresh ones for
 * every encryption. An MCP caller cannot see that field, so this does the same
 * thing and *returns what it drew*. Without that, an encryption over MCP would
 * be unreadable by anything, including this tool a second later — the one
 * failure mode that would make the whole adapter useless while looking like it
 * worked.
 *
 * Decryption therefore requires them back, and says so rather than defaulting:
 * a decryption run against a freshly drawn IV fails with an authentication
 * error that reads like a wrong key.
 */
export const aesCryptTool = defineMcpTool({
    toolId: "aes",
    verb: "crypt",
    title: "Encrypt or decrypt with AES",
    description:
        "Encrypt or decrypt text with AES-GCM, AES-CBC or AES-CTR, keyed by a passphrase (PBKDF2-SHA-256) or by raw hex/base64 key bytes. Encrypting draws a fresh salt and IV and returns them alongside the ciphertext — pass both back, unchanged, to decrypt. GCM additionally authenticates: a wrong key, a wrong IV or a modified ciphertext all fail rather than returning garbage.",
    kind: "offline",
    // Encryption draws a fresh salt and IV, so two identical calls differ.
    readOnly: false,
    inputSchema: z.object({
        direction: aesDirectionSchema.default("encrypt"),
        text: z
            .string()
            .max(MAX_MCP_TEXT_LENGTH)
            .describe("Plaintext when encrypting, ciphertext when decrypting"),
        secret: z
            .string()
            .max(MAX_AES_SECRET_LENGTH)
            .describe("Passphrase, or raw key material in the encoding named by `keySource`"),
        mode: aesModeSchema.default(DEFAULT_AES_OPTIONS.mode),
        keySize: aesKeySizeSchema.default(DEFAULT_AES_OPTIONS.keySize),
        keySource: aesKeySourceSchema
            .default(DEFAULT_AES_OPTIONS.keySource)
            .describe("How to read `secret`: derive from a passphrase, or use it as key bytes"),
        saltHex: z
            .string()
            .default("")
            .describe(
                "PBKDF2 salt as hex. Required to decrypt a passphrase-keyed message; drawn fresh and returned when encrypting",
            ),
        ivHex: z
            .string()
            .default("")
            .describe(
                "Initialisation vector as hex. Required to decrypt; drawn fresh and returned when encrypting",
            ),
        tagLength: gcmTagLengthSchema.default(DEFAULT_AES_OPTIONS.tagLength),
        iterations: pbkdf2IterationsSchema.default(DEFAULT_AES_OPTIONS.iterations),
        textEncoding: aesTextEncodingSchema.default(DEFAULT_AES_OPTIONS.textEncoding),
        cipherEncoding: aesCipherEncodingSchema.default(DEFAULT_AES_OPTIONS.cipherEncoding),
    }),
    run: async ({ direction, text, secret, saltHex, ivHex, ...rest }) => {
        const encrypting = direction === "encrypt";

        // Drawn only when encrypting. Filling one in for a decryption would
        // turn "you forgot the IV" into "your key is wrong".
        const salt = saltHex.length > 0 ? saltHex : encrypting ? randomSaltHex() : "";
        const iv = ivHex.length > 0 ? ivHex : encrypting ? randomIvHex(rest.mode) : "";

        const options = { ...rest, saltHex: salt, ivHex: iv };
        const result = await runAes({
            direction,
            source: { kind: "text", text },
            secret,
            options,
        });

        if (!result.ok) {
            return refuseWithReason("AES", result.reason, {
                expectedBytes: result.expectedBytes ?? null,
                actualBytes: result.actualBytes ?? null,
                requiredIvBytes: ivBytesFor(rest.mode),
            });
        }

        return succeed(
            `${encrypting ? "Encrypted" : "Decrypted"} ${result.inputBytes} bytes with AES-${rest.keySize}-${rest.mode.toUpperCase()}`,
            {
                output: result.output,
                // Echoed in both directions: the caller needs them to decrypt,
                // and seeing them back confirms which ones were actually used.
                saltHex: salt,
                ivHex: iv,
                mode: rest.mode,
                keySize: rest.keySize,
                inputBytes: result.inputBytes,
                outputBytes: result.outputBytes,
            },
        );
    },
});
