import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

import {
    MAX_EQUATION_INPUT_LENGTH,
    MAX_LATEX_LENGTH,
    MAX_SHARED_TEXT_LENGTH,
} from "../domain/constants";
import { OUTPUT_FORMATS } from "../types";

export const equationInputSchema = z.string().max(MAX_EQUATION_INPUT_LENGTH);

export const latexSourceSchema = z.string().max(MAX_LATEX_LENGTH);

export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

/**
 * Search-param shape for `/tools/equation?text=x2+%2B+y2&display=0`.
 *
 * Each field catches on its own, so one malformed value degrades to a default
 * instead of throwing the whole page away. `display` is read as a string and
 * compared rather than coerced: `z.coerce.boolean()` calls `Boolean()`, which
 * makes the string `"0"` true — the exact opposite of what the link said.
 */
export const equationSearchParamsSchema = z.object({
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    display: z.enum(["0", "1"]).optional().catch(undefined),
});

/**
 * Payload of the `recognizeEquations` server action, read out of a `FormData`.
 *
 * The file is only checked for being a file here. Its type and size are the
 * domain's business — `checkEquationImage` turns each into a reason the reader
 * can act on, where a Zod refinement would collapse four answers into one.
 */
export const recognitionRequestSchema = z.object({
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
    image: z.instanceof(File),
});

/**
 * What the recognizer sends back.
 *
 * Shaped after the worker's own contract, and permissive in exactly the places
 * a model can disappoint it. `success: false` arrives with HTTP 200 when the
 * model looked and found nothing — the status code says the *call* worked — so
 * the body is what decides, not the status.
 *
 * `latex` and `displayMode` are `unknown` rather than typed: the worker asks
 * for a strict JSON schema, and a model that ignores it still answers 200. The
 * domain layer decides what a half-filled answer means.
 */
export const recognizerResponseSchema = z.object({
    success: z.boolean().optional(),
    error: z
        .object({
            code: z.string().optional(),
            message: z.string().optional(),
        })
        .optional(),
    equations: z
        .array(
            z.object({
                latex: z.unknown(),
                displayMode: z.unknown(),
            }),
        )
        .optional(),
});
