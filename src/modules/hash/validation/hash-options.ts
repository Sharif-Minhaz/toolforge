import { z } from "zod";

import {
    MAX_ARGON2_HASH_LENGTH,
    MAX_ARGON2_ITERATIONS,
    MAX_ARGON2_MEMORY,
    MAX_ARGON2_PARALLELISM,
    MAX_BCRYPT_COST,
    MIN_ARGON2_HASH_LENGTH,
    MIN_ARGON2_ITERATIONS,
    MIN_ARGON2_MEMORY,
    MIN_ARGON2_PARALLELISM,
    MIN_BCRYPT_COST,
} from "../domain/constants";
import { DIGEST_ENCODINGS, HASH_ALGORITHMS, HASH_MODES } from "../types";

export const hashModeSchema = z.enum(HASH_MODES);

export const hashAlgorithmSchema = z.enum(HASH_ALGORITHMS);

export const digestEncodingSchema = z.enum(DIGEST_ENCODINGS);

const bcryptCostSchema = z.number().int().min(MIN_BCRYPT_COST).max(MAX_BCRYPT_COST);

const argon2MemorySchema = z.number().int().min(MIN_ARGON2_MEMORY).max(MAX_ARGON2_MEMORY);

const argon2IterationsSchema = z
    .number()
    .int()
    .min(MIN_ARGON2_ITERATIONS)
    .max(MAX_ARGON2_ITERATIONS);

const argon2ParallelismSchema = z
    .number()
    .int()
    .min(MIN_ARGON2_PARALLELISM)
    .max(MAX_ARGON2_PARALLELISM);

const argon2HashLengthSchema = z
    .number()
    .int()
    .min(MIN_ARGON2_HASH_LENGTH)
    .max(MAX_ARGON2_HASH_LENGTH);

/**
 * The generator's full option set. The cross-field rule — Argon2 needs at least
 * `8 * parallelism` KiB — is checked here too, so a payload that would only fail
 * inside the WASM module is refused before it gets there.
 */
export const hashOptionsSchema = z
    .object({
        algorithm: hashAlgorithmSchema,
        encoding: digestEncodingSchema,
        uppercase: z.boolean(),
        bcryptCost: bcryptCostSchema,
        argon2Memory: argon2MemorySchema,
        argon2Iterations: argon2IterationsSchema,
        argon2Parallelism: argon2ParallelismSchema,
        argon2HashLength: argon2HashLengthSchema,
    })
    .refine((options) => options.argon2Memory >= 8 * options.argon2Parallelism, {
        path: ["argon2Memory"],
        message: "Argon2 memory must be at least 8 KiB per lane",
    });

export type HashOptionsInput = z.input<typeof hashOptionsSchema>;

/**
 * Search-param shape for `/tools/hash?mode=compare&algorithm=argon2id`. Each
 * field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 *
 * There is deliberately no parameter carrying the text being hashed. This box
 * is aimed squarely at passwords, and a URL is the one place a password must
 * never go: it lands in browser history, proxy and server access logs, and the
 * `Referer` header of every outbound link on the page.
 */
export const hashSearchParamsSchema = z.object({
    mode: hashModeSchema.optional().catch(undefined),
    algorithm: hashAlgorithmSchema.optional().catch(undefined),
    encoding: digestEncodingSchema.optional().catch(undefined),
    cost: z.coerce.number().pipe(bcryptCostSchema).optional().catch(undefined),
    memory: z.coerce.number().pipe(argon2MemorySchema).optional().catch(undefined),
    iterations: z.coerce.number().pipe(argon2IterationsSchema).optional().catch(undefined),
});

export type HashSearchParams = z.infer<typeof hashSearchParamsSchema>;
