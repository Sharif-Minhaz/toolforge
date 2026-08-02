import { z } from "zod";

import { MAX_QUALITY, MIN_QUALITY, RESIZE_EDGES } from "../domain/constants";
import { OUTPUT_FORMATS } from "../types";

export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

export const qualitySchema = z.number().int().min(MIN_QUALITY).max(MAX_QUALITY);

/**
 * Only the presets the control offers. An arbitrary edge length would be
 * legitimate, but a link naming one would show a slider position the reader
 * cannot reproduce, so the link speaks the same vocabulary as the UI.
 */
const RESIZE_EDGE_VALUES: readonly number[] = RESIZE_EDGES.filter((edge) => edge !== null);

export const maxEdgeSchema = z
    .number()
    .int()
    .refine((value) => RESIZE_EDGE_VALUES.includes(value), { message: "unsupported edge" });

export const compressionOptionsSchema = z.object({
    quality: qualitySchema,
    format: outputFormatSchema,
    maxEdge: maxEdgeSchema.nullable(),
});

/**
 * Search-param shape for `/tools/image-compressor?format=webp&quality=70&maxEdge=1920`.
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const compressionSearchParamsSchema = z.object({
    quality: z.coerce.number().pipe(qualitySchema).optional().catch(undefined),
    format: outputFormatSchema.optional().catch(undefined),
    maxEdge: z.coerce.number().pipe(maxEdgeSchema).optional().catch(undefined),
});
