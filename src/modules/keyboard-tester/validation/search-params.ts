import { z } from "zod";

import {
    KEY_FAULT_WINDOW_STEP_MS,
    MAX_KEY_FAULT_WINDOW_MS,
    MIN_KEY_FAULT_WINDOW_MS,
} from "../domain/constants";
import { KEY_LABEL_SYSTEMS, KEYBOARD_SIZES, KEYBOARD_STANDARDS } from "../types";

/**
 * `?size=tkl&standard=iso&os=mac&window=30` opens the tester on the reader's
 * own board. Each field falls back on its own, so one wrong value in a shared
 * link costs that value and not the page.
 */
export const keyboardTesterSearchParamsSchema = z.object({
    size: z.enum(KEYBOARD_SIZES).optional().catch(undefined),
    standard: z.enum(KEYBOARD_STANDARDS).optional().catch(undefined),
    os: z.enum(KEY_LABEL_SYSTEMS).optional().catch(undefined),
    window: z.coerce
        .number()
        .int()
        .min(MIN_KEY_FAULT_WINDOW_MS)
        .max(MAX_KEY_FAULT_WINDOW_MS)
        .multipleOf(KEY_FAULT_WINDOW_STEP_MS)
        .optional()
        .catch(undefined),
});
