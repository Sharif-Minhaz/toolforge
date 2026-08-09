import { z } from "zod";

import { MAX_PUBLIC_EXPONENT_LENGTH } from "../domain/constants";
import { parsePublicExponent } from "../domain/exponent";
import { RSA_KEY_FORMATS } from "@/modules/tools/types";
import { RSA_HASHES, RSA_KEY_SIZES, RSA_OUTPUT_FORMATS, RSA_USAGES } from "../types";

export const rsaKeySizeSchema = z.union(
    RSA_KEY_SIZES.map((size) => z.literal(size)) as [
        z.ZodLiteral<(typeof RSA_KEY_SIZES)[number]>,
        ...z.ZodLiteral<(typeof RSA_KEY_SIZES)[number]>[],
    ],
);

export const rsaUsageSchema = z.enum(RSA_USAGES);

export const rsaHashSchema = z.enum(RSA_HASHES);

export const rsaKeyFormatSchema = z.enum(RSA_KEY_FORMATS);

export const rsaOutputFormatSchema = z.enum(RSA_OUTPUT_FORMATS);

/**
 * The exponent as it is typed, checked by the domain rather than by a second
 * regular expression here — "at least three, odd, and nothing but digits" is one
 * rule and it lives in `parsePublicExponent`. Restating it would give the schema
 * and the generator two chances to disagree.
 */
export const publicExponentSchema = z
    .string()
    .max(MAX_PUBLIC_EXPONENT_LENGTH)
    .refine((raw) => parsePublicExponent(raw) !== null, {
        message: "The public exponent must be an odd integer of at least 3",
    });

export const rsaOptionsSchema = z.object({
    keySize: rsaKeySizeSchema,
    usage: rsaUsageSchema,
    hash: rsaHashSchema,
    keyFormat: rsaKeyFormatSchema,
    outputFormat: rsaOutputFormatSchema,
    publicExponent: publicExponentSchema,
});

export type RsaOptionsInput = z.input<typeof rsaOptionsSchema>;

/**
 * Search-param shape for `/tools/rsa?keySize=4096&outputFormat=jwk`. Each field
 * catches on its own, so one malformed value degrades to a default instead of
 * throwing the whole page away.
 *
 * Only the shape of the request travels. There is deliberately no parameter that
 * could carry a key: a URL lands in browser history, in proxy and server access
 * logs and in the `Referer` header of every outbound link on the page, which is
 * the last place a private key should ever be.
 */
export const rsaSearchParamsSchema = z.object({
    keySize: z.coerce.number().pipe(rsaKeySizeSchema).optional().catch(undefined),
    usage: rsaUsageSchema.optional().catch(undefined),
    hash: rsaHashSchema.optional().catch(undefined),
    keyFormat: rsaKeyFormatSchema.optional().catch(undefined),
    outputFormat: rsaOutputFormatSchema.optional().catch(undefined),
    publicExponent: publicExponentSchema.optional().catch(undefined),
});

export type RsaSearchParams = z.infer<typeof rsaSearchParamsSchema>;
