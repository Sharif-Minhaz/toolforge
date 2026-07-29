import { z } from "zod";

/** Cloudflare's siteverify reply; only `success` decides anything. */
export const turnstileVerificationSchema = z.object({
    success: z.boolean(),
    "error-codes": z.array(z.string()).optional(),
});
