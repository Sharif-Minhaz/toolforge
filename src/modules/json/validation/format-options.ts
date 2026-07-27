import { z } from "zod";

import { MAX_SHARED_TEXT_LENGTH } from "../domain/constants";
import { JSON_INDENTS, JSON_MODES, JSON_SPECS } from "../types";

export const jsonModeSchema = z.enum(JSON_MODES);

export const jsonIndentSchema = z.enum(JSON_INDENTS);

export const jsonSpecSchema = z.enum(JSON_SPECS);

export const jsonFormatOptionsSchema = z.object({
    indent: jsonIndentSchema,
    spec: jsonSpecSchema,
    repair: z.boolean(),
    sortKeys: z.boolean(),
    escapeUnicode: z.boolean(),
});

export type JsonFormatOptionsInput = z.input<typeof jsonFormatOptionsSchema>;

/** `"1"`, `"true"` and `"on"` all arrive as strings in a shared link. */
const linkFlagSchema = z
    .enum(["1", "true", "on", "0", "false", "off"])
    .transform((value) => value === "1" || value === "true" || value === "on");

/**
 * Search-param shape for `/tools/json?mode=minify&indent=tab&repair=1`. Each
 * field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const jsonSearchParamsSchema = z.object({
    mode: jsonModeSchema.optional().catch(undefined),
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    indent: jsonIndentSchema.optional().catch(undefined),
    spec: jsonSpecSchema.optional().catch(undefined),
    repair: linkFlagSchema.optional().catch(undefined),
    sortKeys: linkFlagSchema.optional().catch(undefined),
    escapeUnicode: linkFlagSchema.optional().catch(undefined),
});
