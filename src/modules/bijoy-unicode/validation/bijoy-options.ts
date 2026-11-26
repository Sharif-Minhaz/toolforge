import { z } from "zod";

import { MAX_BIJOY_INPUT_LENGTH, MAX_SHARED_TEXT_LENGTH } from "../domain/constants";
import { BIJOY_DIRECTIONS } from "../types";

export const bijoyDirectionSchema = z.enum(BIJOY_DIRECTIONS);

export const bijoyInputSchema = z.string().max(MAX_BIJOY_INPUT_LENGTH);

/**
 * Search-param shape for `/tools/bijoy-unicode?to=bijoy&text=…`. Each field
 * catches on its own, so one malformed value degrades to the default instead
 * of throwing the whole page away.
 */
export const bijoySearchParamsSchema = z.object({
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    to: z
        .enum(["unicode", "bijoy"])
        .transform((to) => (to === "unicode" ? "to-unicode" : "to-bijoy"))
        .optional()
        .catch(undefined),
});
