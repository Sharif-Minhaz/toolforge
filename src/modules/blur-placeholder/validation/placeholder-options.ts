import { z } from "zod";

import {
    MAX_COMPONENTS,
    MAX_HASH_LENGTH,
    MAX_PUNCH,
    MIN_COMPONENTS,
    MIN_PUNCH,
} from "../domain/constants";
import { ASPECT_RATIOS, BLUR_MODES, PLACEHOLDER_EDGES } from "../types";

export const blurModeSchema = z.enum(BLUR_MODES);

export const aspectRatioSchema = z.enum(ASPECT_RATIOS);

export const componentSchema = z.number().int().min(MIN_COMPONENTS).max(MAX_COMPONENTS);

/**
 * Half-steps only. A punch of 1.37 is meaningful arithmetic and a control
 * position nobody can reproduce, so the link speaks the same vocabulary as the
 * slider.
 */
export const punchSchema = z
    .number()
    .min(MIN_PUNCH)
    .max(MAX_PUNCH)
    .refine((value) => Number.isInteger(value * 2), { message: "unsupported punch" });

export const placeholderEdgeSchema = z.union(
    PLACEHOLDER_EDGES.map((edge) => z.literal(edge)) as [
        z.ZodLiteral<(typeof PLACEHOLDER_EDGES)[number]>,
        ...z.ZodLiteral<(typeof PLACEHOLDER_EDGES)[number]>[],
    ],
);

export const placeholderOptionsSchema = z.object({
    componentX: componentSchema,
    componentY: componentSchema,
    punch: punchSchema,
    edge: placeholderEdgeSchema,
    ratio: aspectRatioSchema,
});

/**
 * A hash is checked for shape here and for meaning in `parseBlurhash`. This
 * only keeps a query string from carrying a novel into the page; the reasons a
 * reader actually needs to read come from the codec, with a position attached.
 */
export const hashParamSchema = z.string().trim().min(1).max(MAX_HASH_LENGTH);

/**
 * Search-param shape for
 * `/tools/blur-placeholder?mode=decode&hash=LEHV6nWB…&ratio=16:9&punch=1.5`.
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const placeholderSearchParamsSchema = z.object({
    mode: blurModeSchema.optional().catch(undefined),
    x: z.coerce.number().pipe(componentSchema).optional().catch(undefined),
    y: z.coerce.number().pipe(componentSchema).optional().catch(undefined),
    punch: z.coerce.number().pipe(punchSchema).optional().catch(undefined),
    edge: z.coerce.number().pipe(placeholderEdgeSchema).optional().catch(undefined),
    ratio: aspectRatioSchema.optional().catch(undefined),
    hash: hashParamSchema.optional().catch(undefined),
});
