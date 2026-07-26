import { z } from "zod";

import { UUID_EXPORT_FORMATS, UUID_VERSIONS } from "../types";
import { MAX_UUID_QUANTITY, MIN_UUID_QUANTITY } from "../domain/constants";

export const uuidVersionSchema = z.union([z.literal(1), z.literal(4), z.literal(7)]);

export const uuidQuantitySchema = z.coerce
    .number()
    .int()
    .min(MIN_UUID_QUANTITY)
    .max(MAX_UUID_QUANTITY);

export const uuidExportFormatSchema = z.enum(UUID_EXPORT_FORMATS);

export const uuidGenerationOptionsSchema = z.object({
    version: uuidVersionSchema,
    quantity: uuidQuantitySchema,
});

export type UuidGenerationOptionsInput = z.input<typeof uuidGenerationOptionsSchema>;

/** Search-param shape for `/tools/uuid?version=7&quantity=25`. */
export const uuidSearchParamsSchema = z.object({
    version: z.coerce
        .number()
        .refine((value): value is (typeof UUID_VERSIONS)[number] =>
            UUID_VERSIONS.includes(value as (typeof UUID_VERSIONS)[number]),
        )
        .optional()
        .catch(undefined),
    quantity: uuidQuantitySchema.optional().catch(undefined),
});
