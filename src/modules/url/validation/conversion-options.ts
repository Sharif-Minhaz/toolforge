import { z } from "zod";

import { CHARSET_IDS } from "@/modules/tools/domain/charsets";
import { NEWLINE_SEPARATORS } from "@/modules/tools/types";
import { MAX_SHARED_TEXT_LENGTH } from "../domain/constants";
import { URL_ENCODE_PROFILES, URL_MODES } from "../types";

export const urlModeSchema = z.enum(URL_MODES);

export const urlEncodeProfileSchema = z.enum(URL_ENCODE_PROFILES);

export const urlCharsetSchema = z.enum(CHARSET_IDS);

export const urlNewlineSeparatorSchema = z.enum(NEWLINE_SEPARATORS);

export const urlConversionOptionsSchema = z.object({
    profile: urlEncodeProfileSchema,
    uppercaseHex: z.boolean(),
    charset: urlCharsetSchema,
    newline: urlNewlineSeparatorSchema,
    perLine: z.boolean(),
    wrapLines: z.boolean(),
    plusAsSpace: z.boolean(),
    recursive: z.boolean(),
});

export type UrlConversionOptionsInput = z.input<typeof urlConversionOptionsSchema>;

/**
 * Search-param shape for `/tools/url?mode=decode&text=a%20b&profile=form`.
 * Each field catches on its own so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const urlSearchParamsSchema = z.object({
    mode: urlModeSchema.optional().catch(undefined),
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    profile: urlEncodeProfileSchema.optional().catch(undefined),
    charset: urlCharsetSchema.optional().catch(undefined),
});
