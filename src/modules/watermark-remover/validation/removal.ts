import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

/**
 * Payload of the `removeWatermark` server action, read out of a `FormData`.
 *
 * Both files are only checked for being files here. Their type and size are the
 * domain's business — `checkImageFile` turns each into a reason the reader can
 * act on, where a Zod refinement would collapse every one of them into "invalid
 * request".
 */
export const watermarkRemovalRequestSchema = z.object({
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
    image: z.instanceof(File),
    mask: z.instanceof(File),
});

export type WatermarkRemovalRequestInput = z.input<typeof watermarkRemovalRequestSchema>;
