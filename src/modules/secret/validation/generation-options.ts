import { z } from "zod";

import { SECRET_ENCODINGS, SECRET_SHAPES } from "../types";
import {
    MAX_SECRET_BYTES,
    MAX_VARIABLE_NAME_LENGTH,
    MIN_SECRET_BYTES,
    VARIABLE_NAME_PATTERN,
} from "../domain/constants";

export const secretEncodingSchema = z.enum(SECRET_ENCODINGS);

export const secretShapeSchema = z.enum(SECRET_SHAPES);

export const secretByteLengthSchema = z.coerce
    .number()
    .int()
    .min(MIN_SECRET_BYTES)
    .max(MAX_SECRET_BYTES);

export const variableNameSchema = z
    .string()
    .max(MAX_VARIABLE_NAME_LENGTH)
    .regex(VARIABLE_NAME_PATTERN);

export const secretOptionsSchema = z.object({
    byteLength: secretByteLengthSchema,
    encoding: secretEncodingSchema,
    padded: z.boolean(),
    shape: secretShapeSchema,
    variableName: variableNameSchema,
});

export type SecretOptionsInput = z.input<typeof secretOptionsSchema>;

/** A query string carries strings, so a switch arrives as one of these four. */
const booleanParamSchema = z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1");

/**
 * Search-param shape for `/tools/secret?bytes=64&encoding=hex&shape=env`.
 *
 * Every field catches its own failure, so one malformed value opens the tool on
 * its default rather than returning a 500. Deliberately absent: the secret
 * itself. A generated key never goes in a URL, where it would land in browser
 * history, the referrer header and every proxy log between here and there.
 */
export const secretSearchParamsSchema = z.object({
    bytes: secretByteLengthSchema.optional().catch(undefined),
    encoding: secretEncodingSchema.optional().catch(undefined),
    padded: booleanParamSchema.optional().catch(undefined),
    shape: secretShapeSchema.optional().catch(undefined),
    name: variableNameSchema.optional().catch(undefined),
});
