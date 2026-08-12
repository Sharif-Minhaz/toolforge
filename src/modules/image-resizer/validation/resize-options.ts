import { z } from "zod";

import {
    MAX_DIMENSION,
    MAX_DPI,
    MAX_PERCENTAGE,
    MAX_QUALITY,
    MIN_DIMENSION,
    MIN_DPI,
    MIN_PERCENTAGE,
    MIN_QUALITY,
} from "../domain/constants";
import { SIZE_PRESETS } from "../domain/presets";
import { BACKGROUND_KINDS, FIT_MODES, LENGTH_UNITS, OUTPUT_FORMATS, RESIZE_MODES } from "../types";

export const resizeModeSchema = z.enum(RESIZE_MODES);

export const lengthUnitSchema = z.enum(LENGTH_UNITS);

export const fitModeSchema = z.enum(FIT_MODES);

export const backgroundKindSchema = z.enum(BACKGROUND_KINDS);

export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

export const dimensionSchema = z.number().min(MIN_DIMENSION).max(MAX_DIMENSION);

export const dpiSchema = z.number().int().min(MIN_DPI).max(MAX_DPI);

export const percentageSchema = z.number().int().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE);

export const qualitySchema = z.number().int().min(MIN_QUALITY).max(MAX_QUALITY);

/** `#rgb` or `#rrggbb`. A short identity field, so it is capped, not metered. */
export const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

const PRESET_IDS: readonly string[] = SIZE_PRESETS.map((preset) => preset.id);

/**
 * Only presets the picker actually offers. An arbitrary id would be a control
 * position the reader cannot reproduce, so a link speaks the same vocabulary as
 * the UI does.
 */
export const presetIdSchema = z
    .string()
    .refine((value) => PRESET_IDS.includes(value), { message: "unknown preset" });

export const resizeOptionsSchema = z.object({
    mode: resizeModeSchema,
    width: dimensionSchema.nullable(),
    height: dimensionSchema.nullable(),
    unit: lengthUnitSchema,
    dpi: dpiSchema,
    percentage: percentageSchema,
    presetId: presetIdSchema,
    lockAspect: z.boolean(),
    fit: fitModeSchema,
    background: backgroundKindSchema,
    backgroundColor: hexColorSchema,
    format: outputFormatSchema,
    quality: qualitySchema,
    embedDensity: z.boolean(),
});

/**
 * Search-param shape for
 * `/tools/image-resizer?mode=preset&preset=bd-passport&dpi=300&format=jpeg`.
 *
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away — and a link naming a preset that no
 * longer exists opens on the default preset rather than on an error.
 */
export const resizeSearchParamsSchema = z.object({
    mode: resizeModeSchema.optional().catch(undefined),
    w: z.coerce.number().pipe(dimensionSchema).optional().catch(undefined),
    h: z.coerce.number().pipe(dimensionSchema).optional().catch(undefined),
    unit: lengthUnitSchema.optional().catch(undefined),
    dpi: z.coerce.number().pipe(dpiSchema).optional().catch(undefined),
    percent: z.coerce.number().pipe(percentageSchema).optional().catch(undefined),
    preset: presetIdSchema.optional().catch(undefined),
    fit: fitModeSchema.optional().catch(undefined),
    format: outputFormatSchema.optional().catch(undefined),
    quality: z.coerce.number().pipe(qualitySchema).optional().catch(undefined),
    bg: hexColorSchema.optional().catch(undefined),
});

export type ResizeSearchParams = z.infer<typeof resizeSearchParamsSchema>;
