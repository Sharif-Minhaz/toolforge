import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

/**
 * Payload of the `detectAiImage` server action, read out of a `FormData`.
 *
 * The file is only checked for being a file here. Its type and size are the
 * domain's business — `checkImageFile` turns each into a reason the reader can
 * act on, where a Zod refinement would collapse both into "invalid request".
 */
export const imageDetectionRequestSchema = z.object({
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
    image: z.instanceof(File),
});

export type ImageDetectionRequestInput = z.input<typeof imageDetectionRequestSchema>;

/**
 * What the worker sends back. Every field inside `result` is `unknown` because
 * a model that ignores its instructions still returns 200 — the domain layer
 * decides what a half-filled answer means.
 */
export const imageDetectorResponseSchema = z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    result: z
        .object({
            is_ai_generated: z.unknown(),
            confidence: z.unknown(),
            reasoning: z.unknown(),
        })
        .optional(),
});
