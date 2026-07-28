import { z } from "zod";

import {
    MAX_DETECTION_TEXT_LENGTH,
    MAX_SUBMITTED_TEXT_LENGTH,
    MAX_TURNSTILE_TOKEN_LENGTH,
} from "../domain/constants";

/**
 * Payload of the `detectAiText` server action. The text bound is deliberately
 * looser than the detector's own ceiling: `checkDetectionText` turns an
 * over-long passage into a `too_long` the reader can act on, and this only
 * stops an unbounded body reaching the parser at all.
 */
export const detectionRequestSchema = z.object({
    text: z.string().max(MAX_SUBMITTED_TEXT_LENGTH),
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
});

export type DetectionRequestInput = z.input<typeof detectionRequestSchema>;

/**
 * What the worker sends back. Every field is optional because a model that
 * ignores its instructions still returns 200 — the domain layer decides what a
 * half-filled answer means.
 */
export const detectorResponseSchema = z.object({
    label: z.string().optional(),
    confidence: z.union([z.number(), z.string()]).optional(),
    reasoning: z.string().optional(),
    model: z.string().optional(),
    error: z.string().optional(),
});

/** Cloudflare's siteverify reply; only `success` decides anything. */
export const turnstileVerificationSchema = z.object({
    success: z.boolean(),
    "error-codes": z.array(z.string()).optional(),
});

/**
 * Search-param shape for `/tools/ai-text-detector?text=…`. The field catches on
 * its own so a malformed link opens on an empty box instead of a 500.
 */
export const aiTextDetectorSearchParamsSchema = z.object({
    text: z.string().max(MAX_DETECTION_TEXT_LENGTH).optional().catch(undefined),
});
