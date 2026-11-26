import { z } from "zod";

import { MAX_MODE_INPUT_LENGTH, MAX_PATH_LENGTH } from "../domain/constants";

/** An octal or symbolic mode as typed; `parseMode` decides which. */
export const modeInputSchema = z.string().max(MAX_MODE_INPUT_LENGTH);

export const chmodPathSchema = z.string().max(MAX_PATH_LENGTH);

/**
 * Search-param shape for `/tools/chmod?mode=755` (or `?mode=rwxr-xr-x`). Each
 * field catches on its own, so a malformed value opens the default mode
 * instead of an error page.
 */
export const chmodSearchParamsSchema = z.object({
    mode: modeInputSchema.optional().catch(undefined),
});
