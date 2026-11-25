import { z } from "zod";

import { OCR_LANGUAGES } from "../types";

export const ocrLanguageSchema = z.enum(OCR_LANGUAGES);

/** Per field `.catch`, so a link naming an unknown language opens on the default. */
export const ocrSearchParamsSchema = z.object({
    lang: ocrLanguageSchema.optional().catch(undefined),
});
