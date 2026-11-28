import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

import { MAX_HEIGHT_MM, MIN_HEIGHT_MM } from "../domain/constants";
import { MESH_DETAILS, MODEL_FORMATS } from "../types";

export const modelFormatSchema = z.enum(MODEL_FORMATS);

export const meshDetailSchema = z.enum(MESH_DETAILS);

/**
 * Millimetres, whole.
 *
 * A millimetre is the step the field offers, and finer than anyone sizing a
 * desk object by eye means. The model's own estimate is rounded to it before
 * the field shows it, so the default always passes.
 */
export const heightSchema = z.number().int().min(MIN_HEIGHT_MM).max(MAX_HEIGHT_MM);

/**
 * Search-param shape for `/tools/image-to-3d?detail=high&format=stl`.
 *
 * Only the two settings that mean something before there is a model. The
 * height does not travel: it defaults to the size of whatever the picture
 * turns out to show, and a link cannot know that in advance.
 */
export const modelSearchParamsSchema = z.object({
    detail: meshDetailSchema.optional().catch(undefined),
    format: modelFormatSchema.optional().catch(undefined),
});

/**
 * Payload of the `describeObject` server action, read out of a `FormData`.
 *
 * The file is only checked for being a file here. Its type and size are the
 * domain's business — `checkUploadImage` turns each into a reason the reader
 * can act on, where a Zod refinement would collapse three answers into one.
 */
export const describeRequestSchema = z.object({
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
    image: z.instanceof(File),
});

/**
 * What the worker sends back on success: Workers AI's chat completion, wrapped.
 *
 * Only the fields the action reads, and each optional, because a model that
 * returns an empty choice list still answers 200. `content` is a string the
 * parser reads as JSON; `finish_reason: "length"` is how a truncated answer
 * announces itself before the parser finds out the hard way.
 */
export const workerResponseSchema = z.object({
    result: z.object({
        choices: z
            .array(
                z.object({
                    finish_reason: z.string().nullish(),
                    message: z.object({ content: z.string().nullish() }),
                }),
            )
            .min(1),
        usage: z.object({ neurons: z.number().optional() }).optional(),
    }),
});
