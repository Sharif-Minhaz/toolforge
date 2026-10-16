import { z } from "zod";

import {
    FAULT_WINDOW_STEP_MS,
    MAX_FAULT_WINDOW_MS,
    MIN_FAULT_WINDOW_MS,
} from "../domain/constants";
import { DPI_DISTANCE_RANGE, type DpiUnit } from "../domain/dpi";

/**
 * `?window=` opens the tester with a fault window already set, so a support
 * page can link to the exact threshold its warranty terms use. Out of range or
 * not a number and the default applies instead of an error.
 */
export const faultWindowSchema = z.coerce
    .number()
    .int()
    .min(MIN_FAULT_WINDOW_MS)
    .max(MAX_FAULT_WINDOW_MS)
    // The slider moves in steps; a value between two of them would have no
    // position to show.
    .multipleOf(FAULT_WINDOW_STEP_MS);

export const mouseTesterSearchParamsSchema = z.object({
    window: faultWindowSchema.optional().catch(undefined),
});

/** The ruler length typed into the DPI test, in the unit beside it. */
export function dpiDistanceSchema(unit: DpiUnit) {
    const { min, max } = DPI_DISTANCE_RANGE[unit];

    return z.coerce.number().finite().min(min).max(max);
}
