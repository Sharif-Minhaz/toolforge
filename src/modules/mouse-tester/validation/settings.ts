import { z } from "zod";

import {
    FAULT_WINDOW_STEP_MS,
    MAX_FAULT_WINDOW_MS,
    MIN_FAULT_WINDOW_MS,
} from "../domain/constants";
import { AIM_DURATIONS, AIM_TARGET_SIZES, MOUSE_TESTER_MODES } from "../types";

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

/** `?mode=aim&target=small&time=60` opens the aim trainer ready to go. */
export const mouseTesterSearchParamsSchema = z.object({
    window: faultWindowSchema.optional().catch(undefined),
    mode: z.enum(MOUSE_TESTER_MODES).optional().catch(undefined),
    target: z.enum(AIM_TARGET_SIZES).optional().catch(undefined),
    time: z.coerce
        .number()
        .pipe(z.union(AIM_DURATIONS.map((value) => z.literal(value))))
        .optional()
        .catch(undefined),
});
