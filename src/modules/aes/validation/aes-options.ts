import { z } from "zod";

import { MAX_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS } from "../domain/constants";
import { readIvBytes } from "../domain/modes";
import {
    AES_CIPHER_ENCODINGS,
    AES_DIRECTIONS,
    AES_KEY_SIZES,
    AES_KEY_SOURCES,
    AES_MODES,
    AES_TEXT_ENCODINGS,
    GCM_TAG_LENGTHS,
} from "../types";

export const aesDirectionSchema = z.enum(AES_DIRECTIONS);

export const aesModeSchema = z.enum(AES_MODES);

export const aesKeySizeSchema = z.union(
    AES_KEY_SIZES.map((size) => z.literal(size)) as [
        z.ZodLiteral<(typeof AES_KEY_SIZES)[number]>,
        ...z.ZodLiteral<(typeof AES_KEY_SIZES)[number]>[],
    ],
);

export const aesKeySourceSchema = z.enum(AES_KEY_SOURCES);

export const gcmTagLengthSchema = z.union(
    GCM_TAG_LENGTHS.map((bits) => z.literal(bits)) as [
        z.ZodLiteral<(typeof GCM_TAG_LENGTHS)[number]>,
        ...z.ZodLiteral<(typeof GCM_TAG_LENGTHS)[number]>[],
    ],
);

export const aesTextEncodingSchema = z.enum(AES_TEXT_ENCODINGS);

export const aesCipherEncodingSchema = z.enum(AES_CIPHER_ENCODINGS);

export const pbkdf2IterationsSchema = z
    .number()
    .int()
    .min(MIN_PBKDF2_ITERATIONS)
    .max(MAX_PBKDF2_ITERATIONS);

/** Whitespace and case are both tolerated; the domain compacts before reading. */
const hexSchema = z.string().regex(/^[\s0-9a-fA-F]*$/);

/**
 * The workbench's full option set.
 *
 * The IV width is checked here as well as in the cipher, because it is the one
 * cross-field rule in the whole tool: twelve bytes under GCM, a full block
 * under CBC and CTR. A payload that would only fail inside Web Crypto is
 * refused before it gets there.
 */
export const aesOptionsSchema = z
    .object({
        mode: aesModeSchema,
        keySize: aesKeySizeSchema,
        keySource: aesKeySourceSchema,
        saltHex: hexSchema,
        ivHex: hexSchema,
        tagLength: gcmTagLengthSchema,
        iterations: pbkdf2IterationsSchema,
        textEncoding: aesTextEncodingSchema,
        cipherEncoding: aesCipherEncodingSchema,
    })
    // The one cross-field rule in the tool, and it is asked of the domain
    // rather than restated here — CBC and CTR need exactly a block, GCM takes
    // any nonce width it is given.
    .refine((options) => readIvBytes(options.mode, options.ivHex) !== null, {
        path: ["ivHex"],
        message: "The IV must be a width this mode accepts",
    });

export type AesOptionsInput = z.input<typeof aesOptionsSchema>;

/**
 * Search-param shape for `/tools/aes?direction=decrypt&mode=cbc&keySize=256`.
 * Each field catches on its own, so one malformed value degrades to a default
 * instead of throwing the whole page away.
 *
 * There is deliberately no parameter carrying the payload, the passphrase, the
 * key, the salt or the IV. A URL lands in browser history, in proxy and server
 * access logs, and in the `Referer` header of every outbound link on the page —
 * which is the last place any part of an encryption should be. Only the shape
 * of the operation travels; none of its substance does.
 */
export const aesSearchParamsSchema = z.object({
    direction: aesDirectionSchema.optional().catch(undefined),
    mode: aesModeSchema.optional().catch(undefined),
    keySize: z.coerce.number().pipe(aesKeySizeSchema).optional().catch(undefined),
    keySource: aesKeySourceSchema.optional().catch(undefined),
    tagLength: z.coerce.number().pipe(gcmTagLengthSchema).optional().catch(undefined),
    iterations: z.coerce.number().pipe(pbkdf2IterationsSchema).optional().catch(undefined),
    textEncoding: aesTextEncodingSchema.optional().catch(undefined),
    cipherEncoding: aesCipherEncodingSchema.optional().catch(undefined),
});

export type AesSearchParams = z.infer<typeof aesSearchParamsSchema>;
