import { z } from "zod";

import {
    PAYLOAD_BINARY_ENCODINGS,
    PAYLOAD_TEXT_ENCODINGS,
    RSA_KEY_KINDS,
} from "@/modules/tools/types";
import {
    RSA_CRYPT_DIRECTIONS,
    RSA_CRYPT_HASHES,
    RSA_KEY_INPUT_FORMATS,
    RSA_PADDINGS,
} from "../types";

export const rsaCryptDirectionSchema = z.enum(RSA_CRYPT_DIRECTIONS);

export const rsaKeyInputFormatSchema = z.enum(RSA_KEY_INPUT_FORMATS);

export const rsaKeyKindSchema = z.enum(RSA_KEY_KINDS);

export const rsaPaddingSchema = z.enum(RSA_PADDINGS);

export const rsaCryptHashSchema = z.enum(RSA_CRYPT_HASHES);

export const payloadTextEncodingSchema = z.enum(PAYLOAD_TEXT_ENCODINGS);

export const payloadBinaryEncodingSchema = z.enum(PAYLOAD_BINARY_ENCODINGS);

export const rsaCryptOptionsSchema = z.object({
    keyFormat: rsaKeyInputFormatSchema,
    keyKind: rsaKeyKindSchema,
    padding: rsaPaddingSchema,
    hash: rsaCryptHashSchema,
    textEncoding: payloadTextEncodingSchema,
    cipherEncoding: payloadBinaryEncodingSchema,
});

export type RsaCryptOptionsInput = z.input<typeof rsaCryptOptionsSchema>;

/**
 * Search-param shape for `/tools/rsa-encrypt?direction=decrypt&hash=SHA-512`.
 * Each field catches on its own, so one malformed value degrades to a default
 * instead of throwing the whole page away.
 *
 * There is deliberately no parameter carrying the key or the payload. A URL
 * lands in browser history, in proxy and server access logs, and in the
 * `Referer` header of every outbound link on the page — which is the last place
 * a private key or a plaintext should be. Only the shape of the operation
 * travels; none of its substance does.
 */
export const rsaCryptSearchParamsSchema = z.object({
    direction: rsaCryptDirectionSchema.optional().catch(undefined),
    keyFormat: rsaKeyInputFormatSchema.optional().catch(undefined),
    keyKind: rsaKeyKindSchema.optional().catch(undefined),
    hash: rsaCryptHashSchema.optional().catch(undefined),
    textEncoding: payloadTextEncodingSchema.optional().catch(undefined),
    cipherEncoding: payloadBinaryEncodingSchema.optional().catch(undefined),
});

export type RsaCryptSearchParams = z.infer<typeof rsaCryptSearchParamsSchema>;
