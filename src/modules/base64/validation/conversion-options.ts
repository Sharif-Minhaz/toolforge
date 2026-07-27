import { z } from "zod";

import { CHARSET_IDS } from "@/modules/tools/domain/charsets";
import { NEWLINE_SEPARATORS } from "@/modules/tools/types";
import { MAX_SHARED_TEXT_LENGTH } from "../domain/constants";
import { BASE64_ALPHABETS, BASE64_MODES } from "../types";

export const base64ModeSchema = z.enum(BASE64_MODES);

export const base64AlphabetSchema = z.enum(BASE64_ALPHABETS);

export const charsetSchema = z.enum(CHARSET_IDS);

export const newlineSeparatorSchema = z.enum(NEWLINE_SEPARATORS);

export const base64ConversionOptionsSchema = z.object({
    alphabet: base64AlphabetSchema,
    padded: z.boolean(),
    dataUri: z.boolean(),
    charset: charsetSchema,
    newline: newlineSeparatorSchema,
    perLine: z.boolean(),
    wrapLines: z.boolean(),
});

export type Base64ConversionOptionsInput = z.input<typeof base64ConversionOptionsSchema>;

/**
 * Search-param shape for `/tools/base64?mode=decode&text=Zm9v&charset=utf-8`.
 * Each field catches on its own so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const base64SearchParamsSchema = z.object({
    mode: base64ModeSchema.optional().catch(undefined),
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    alphabet: base64AlphabetSchema.optional().catch(undefined),
    charset: charsetSchema.optional().catch(undefined),
});
