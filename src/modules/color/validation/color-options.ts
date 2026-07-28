import { z } from "zod";

import { MAX_COLOR_INPUT_LENGTH } from "../domain/constants";
import { COLOR_NOTATIONS, HEX_CASINGS } from "../types";

export const colorNotationSchema = z.enum(COLOR_NOTATIONS);

export const hexCasingSchema = z.enum(HEX_CASINGS);

export const colorFormatOptionsSchema = z.object({
    notation: colorNotationSchema,
    hexCasing: hexCasingSchema,
});

export type ColorFormatOptionsInput = z.input<typeof colorFormatOptionsSchema>;

/**
 * Search-param shape for `/tools/color?color=%23c46895&notation=legacy`.
 *
 * `color` is only length-checked here; whether it names a colour is the
 * parser's business, and an unreadable one falls back to the default rather
 * than failing the request. Each field catches on its own so one malformed
 * value degrades alone.
 */
export const colorSearchParamsSchema = z.object({
    color: z.string().max(MAX_COLOR_INPUT_LENGTH).optional().catch(undefined),
    notation: colorNotationSchema.optional().catch(undefined),
    hexCase: hexCasingSchema.optional().catch(undefined),
});
