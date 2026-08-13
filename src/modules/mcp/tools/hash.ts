import { z } from "zod";

import { compareHash } from "@/modules/hash/domain/compare";
import { DEFAULT_HASH_OPTIONS, MAX_HASH_INPUT_LENGTH } from "@/modules/hash/domain/constants";
import { detectHash } from "@/modules/hash/domain/detect";
import { hashText } from "@/modules/hash/domain/hash";
import { createSaltSeed } from "@/modules/hash/domain/salt";
import { hashAlgorithmSchema, hashOptionsSchema } from "@/modules/hash/validation/hash-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Three tools rather than one, because they answer three different questions
 * and a mode switch would make a model choose an argument set it does not need.
 *
 * The salt is minted here per call rather than accepted as an argument. A
 * caller that could supply the salt could supply a constant one, and a bcrypt
 * hash with a fixed salt is a lookup table waiting to happen.
 */

const optionsShape = {
    encoding: z
        .enum(["hex", "base64"])
        .default(DEFAULT_HASH_OPTIONS.encoding)
        .describe("Digest rendering. Ignored by bcrypt and Argon2, which are self-encoding"),
    uppercase: z.boolean().default(DEFAULT_HASH_OPTIONS.uppercase),
    bcryptCost: z
        .number()
        .int()
        .default(DEFAULT_HASH_OPTIONS.bcryptCost)
        .describe("bcrypt work factor; the round count is 2 ** cost"),
    argon2Memory: z
        .number()
        .int()
        .default(DEFAULT_HASH_OPTIONS.argon2Memory)
        .describe("Argon2 memory cost in KiB, at least 8 per lane"),
    argon2Iterations: z.number().int().default(DEFAULT_HASH_OPTIONS.argon2Iterations),
    argon2Parallelism: z.number().int().default(DEFAULT_HASH_OPTIONS.argon2Parallelism),
    argon2HashLength: z
        .number()
        .int()
        .default(DEFAULT_HASH_OPTIONS.argon2HashLength)
        .describe("Argon2 output length in bytes"),
};

export const hashGenerateTool = defineMcpTool({
    toolId: "hash",
    verb: "generate",
    title: "Hash text",
    description:
        "Hash text with SHA-256, SHA-512, SHA-1, MD5, bcrypt or Argon2 (id/i/d). The digests return hex or base64; bcrypt and Argon2 return their own `$`-delimited encoding with a freshly generated salt, so hashing the same password twice correctly gives two different results. Use `toolforge_hash_compare` to check one, never string equality.",
    kind: "offline",
    // A fresh salt makes two calls with identical arguments differ, which is
    // the whole point for a password hash and worth declaring honestly.
    readOnly: false,
    inputSchema: z.object({
        text: z.string().max(MAX_HASH_INPUT_LENGTH).describe("The text or password to hash"),
        algorithm: hashAlgorithmSchema.default(DEFAULT_HASH_OPTIONS.algorithm),
        ...optionsShape,
    }),
    run: async ({ text, ...options }) => {
        // Parsed a second time against the tool's own schema, which carries the
        // cross-field Argon2 rule the flat shape above cannot express.
        const checked = hashOptionsSchema.safeParse(options);

        if (!checked.success) {
            return refuseWithReason("Hash generator", "invalid_argon2_parameters");
        }

        const result = await hashText({
            text,
            options: checked.data,
            saltSeed: createSaltSeed(),
        });

        if (!result.ok) {
            return refuseWithReason("Hash generator", result.reason, {
                bytes: result.bytes ?? null,
            });
        }

        return succeed(`${result.algorithm}: ${result.hash}`, {
            hash: result.hash,
            algorithm: result.algorithm,
            family: result.family,
        });
    },
});

export const hashCompareTool = defineMcpTool({
    toolId: "hash",
    verb: "compare",
    title: "Verify a hash",
    description:
        "Check a value against a hash. Given a password and a bcrypt or Argon2 hash it verifies the hash properly, reading the cost parameters out of the hash string itself. Given a plaintext and a digest it re-hashes and compares in constant time. Given two hashes it compares them directly. The right-hand hash decides which check runs, so no algorithm has to be named.",
    kind: "offline",
    inputSchema: z.object({
        left: z
            .string()
            .max(MAX_HASH_INPUT_LENGTH)
            .describe("The plaintext to check, or a second hash to compare"),
        right: z.string().max(MAX_HASH_INPUT_LENGTH).describe("The hash to check against"),
    }),
    run: async ({ left, right }) => {
        const result = await compareHash({ left, right });

        if (!result.ok) {
            return refuseWithReason("Hash comparison", result.reason);
        }

        return succeed(result.match ? "Match" : "No match", {
            match: result.match,
            kind: result.kind,
            detected: { ...result.detected },
        });
    },
});

export const hashDetectTool = defineMcpTool({
    toolId: "hash",
    verb: "detect",
    title: "Identify a hash",
    description:
        "Identify what a hash string is, without needing the value behind it. Recognises bcrypt and Argon2 by their `$` prefix and reads back their parameters; identifies MD5, SHA-1, SHA-256 and SHA-512 digests by length and alphabet. Returns null when the string matches nothing known — length alone cannot always decide.",
    kind: "offline",
    inputSchema: z.object({
        value: z.string().max(MAX_HASH_INPUT_LENGTH).describe("The hash string to identify"),
    }),
    run: ({ value }) => {
        const detected = detectHash(value);

        if (detected === null) {
            return succeed("Not a recognised hash format", { detected: null });
        }

        return succeed(
            detected.family === "digest"
                ? `Looks like ${detected.algorithm} in ${detected.encoding}`
                : `${detected.family} hash`,
            { detected: { ...detected } },
        );
    },
});
