import { z } from "zod";

import { MAX_LAND_INPUT_LENGTH } from "../domain/constants";
import { BIGHA_REGIONS, KANI_REGIONS, LAND_UNITS } from "../types";

export const landUnitSchema = z.enum(LAND_UNITS);
export const bighaRegionSchema = z.enum(BIGHA_REGIONS);
export const kaniRegionSchema = z.enum(KANI_REGIONS);

export const landInputSchema = z.string().max(MAX_LAND_INPUT_LENGTH);

export const landOptionsSchema = z.object({
    unit: landUnitSchema,
    bighaRegion: bighaRegionSchema,
    kaniRegion: kaniRegionSchema,
});

/**
 * Search-param shape for `/tools/land-measurement?v=5&unit=katha&bigha=faridpur`.
 * Each field catches on its own, so one malformed value degrades to the
 * default instead of throwing the whole page away.
 */
export const landSearchParamsSchema = z.object({
    v: landInputSchema.optional().catch(undefined),
    unit: landUnitSchema.optional().catch(undefined),
    bigha: bighaRegionSchema.optional().catch(undefined),
    kani: kaniRegionSchema.optional().catch(undefined),
});
