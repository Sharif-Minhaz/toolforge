import { z } from "zod";

import {
    MAX_BASE_MM,
    MAX_DETAIL,
    MAX_DEPTH_MM,
    MAX_RESOLUTION,
    MAX_SMOOTHING,
    MAX_WIDTH_MM,
    MIN_BASE_MM,
    MIN_DETAIL,
    MIN_DEPTH_MM,
    MIN_RESOLUTION,
    MIN_SMOOTHING,
    MIN_WIDTH_MM,
} from "../domain/constants";
import { HEIGHT_SOURCES, MODEL_FORMATS, MODEL_SHAPES } from "../types";

export const heightSourceSchema = z.enum(HEIGHT_SOURCES);

export const modelShapeSchema = z.enum(MODEL_SHAPES);

export const modelFormatSchema = z.enum(MODEL_FORMATS);

export const resolutionSchema = z.number().int().min(MIN_RESOLUTION).max(MAX_RESOLUTION);

export const smoothingSchema = z.number().int().min(MIN_SMOOTHING).max(MAX_SMOOTHING);

/**
 * Millimetres, to one decimal place.
 *
 * A tenth of a millimetre is finer than any consumer printer's nozzle and finer
 * than any renderer will show, and it is also the smallest step the steppers
 * offer — so a link carrying 5.03 would open on a value its own control cannot
 * return to.
 */
const millimetres = (min: number, max: number) =>
    z
        .number()
        .min(min)
        .max(max)
        // Compared with a tolerance rather than `% 1`: 0.1 × 10 is 1.0000000000000002
        // in binary floating point, and an exact test rejects the minimum depth.
        .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, {
            message: "unsupported precision",
        });

export const widthSchema = millimetres(MIN_WIDTH_MM, MAX_WIDTH_MM);

export const depthSchema = millimetres(MIN_DEPTH_MM, MAX_DEPTH_MM);

export const baseThicknessSchema = millimetres(MIN_BASE_MM, MAX_BASE_MM);

/**
 * A share of the bulge, in twentieths — the step the slider offers.
 *
 * Compared with a tolerance for the same reason the millimetres are: 0.05 × 20
 * is 1.0000000000000002, and an exact test rejects the first stop on the track.
 */
export const detailSchema = z
    .number()
    .min(MIN_DETAIL)
    .max(MAX_DETAIL)
    .refine((value) => Math.abs(value * 20 - Math.round(value * 20)) < 1e-9, {
        message: "unsupported precision",
    });

export const modelOptionsSchema = z.object({
    source: heightSourceSchema,
    invert: z.boolean(),
    smoothing: smoothingSchema,
    resolution: resolutionSchema,
    shape: modelShapeSchema,
    width: widthSchema,
    depth: depthSchema,
    solid: z.boolean(),
    baseThickness: baseThicknessSchema,
    detail: detailSchema,
    format: modelFormatSchema,
});

/** `?on=1` and `?on=true` both mean on; anything else falls back to the default. */
const booleanParamSchema = z
    .enum(["1", "0", "true", "false"])
    .transform((value) => value === "1" || value === "true");

/**
 * Search-param shape for
 * `/tools/image-to-3d?shape=cylinder&res=256&depth=8&format=stl`.
 *
 * Each field catches on its own, so a link with one impossible value opens on
 * that field's default rather than throwing the page away. Nothing here coerces
 * one option against another: `base` is accepted even with `solid=0`, because
 * the reader who then turns the backing on should find the thickness they
 * asked for waiting rather than the default.
 */
export const modelSearchParamsSchema = z.object({
    src: heightSourceSchema.optional().catch(undefined),
    invert: booleanParamSchema.optional().catch(undefined),
    smooth: z.coerce.number().pipe(smoothingSchema).optional().catch(undefined),
    res: z.coerce.number().pipe(resolutionSchema).optional().catch(undefined),
    shape: modelShapeSchema.optional().catch(undefined),
    width: z.coerce.number().pipe(widthSchema).optional().catch(undefined),
    depth: z.coerce.number().pipe(depthSchema).optional().catch(undefined),
    solid: booleanParamSchema.optional().catch(undefined),
    base: z.coerce.number().pipe(baseThicknessSchema).optional().catch(undefined),
    detail: z.coerce.number().pipe(detailSchema).optional().catch(undefined),
    cut: booleanParamSchema.optional().catch(undefined),
    format: modelFormatSchema.optional().catch(undefined),
});
