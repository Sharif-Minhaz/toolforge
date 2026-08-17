import { z } from "zod";

import { MAX_QUALITY, MIN_QUALITY, RESIZE_EDGES } from "../domain/constants";
import { BACKGROUND_CHOICES, COLOR_COUNTS, CONVERSION_TARGETS, ICON_SIZES } from "../types";

export const conversionTargetSchema = z.enum(CONVERSION_TARGETS);

export const backgroundChoiceSchema = z.enum(BACKGROUND_CHOICES);

export const qualitySchema = z.number().int().min(MIN_QUALITY).max(MAX_QUALITY);

export const iconSizeSchema = z.union(
    ICON_SIZES.map((size) => z.literal(size)) as [
        z.ZodLiteral<(typeof ICON_SIZES)[number]>,
        ...z.ZodLiteral<(typeof ICON_SIZES)[number]>[],
    ],
);

export const iconSizesSchema = z.array(iconSizeSchema).min(1);

export const colorCountSchema = z.union(
    COLOR_COUNTS.map((count) => z.literal(count)) as [
        z.ZodLiteral<(typeof COLOR_COUNTS)[number]>,
        ...z.ZodLiteral<(typeof COLOR_COUNTS)[number]>[],
    ],
);

/**
 * Only the presets the control offers. An arbitrary edge length would be
 * legitimate, but a link naming one would show a control position the reader
 * cannot reproduce, so the link speaks the same vocabulary as the UI.
 */
const RESIZE_EDGE_VALUES: readonly number[] = RESIZE_EDGES.filter((edge) => edge !== null);

export const maxEdgeSchema = z
    .number()
    .int()
    .refine((value) => RESIZE_EDGE_VALUES.includes(value), { message: "unsupported edge" });

export const conversionOptionsSchema = z.object({
    target: conversionTargetSchema,
    quality: qualitySchema,
    maxEdge: maxEdgeSchema.nullable(),
    background: backgroundChoiceSchema,
    iconSizes: iconSizesSchema,
    colors: colorCountSchema,
});

/**
 * A comma-separated size list, so `?target=ico&sizes=16,32,256` reads the way a
 * person would write it. Anything unrecognised in the list is dropped rather
 * than failing the whole parameter — a link that names one size this tool no
 * longer offers should still open on the rest.
 */
const iconSizesParamSchema = z
    .string()
    .transform((raw) =>
        raw
            .split(",")
            .map((part) => Number(part.trim()))
            .filter((size): size is (typeof ICON_SIZES)[number] =>
                (ICON_SIZES as readonly number[]).includes(size),
            ),
    )
    .pipe(iconSizesSchema);

/**
 * Search-param shape for
 * `/tools/image-converter?target=webp&quality=80&maxEdge=1920&background=white`,
 * or `?target=svg&colors=8&quality=70` for a trace.
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const conversionSearchParamsSchema = z.object({
    target: conversionTargetSchema.optional().catch(undefined),
    quality: z.coerce.number().pipe(qualitySchema).optional().catch(undefined),
    maxEdge: z.coerce.number().pipe(maxEdgeSchema).optional().catch(undefined),
    background: backgroundChoiceSchema.optional().catch(undefined),
    sizes: iconSizesParamSchema.optional().catch(undefined),
    colors: z.coerce.number().pipe(colorCountSchema).optional().catch(undefined),
});
