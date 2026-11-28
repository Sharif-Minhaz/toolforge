import {
    checkImageFile,
    type ImageFileCheck,
    type ImageFileFacts,
} from "@/modules/tools/domain/image-file";

import type { GenerationFailureReason } from "../types";
import { MAX_UPLOAD_BYTES, UPLOAD_EDGE, UPLOAD_IMAGE_TYPES } from "./constants";

/**
 * The upload gate, shared by the island and the action. The island checks so
 * the button can say why it is off; the action checks again because the island
 * is one devtools edit away.
 */
export function checkUploadImage(
    file: ImageFileFacts,
): ImageFileCheck<(typeof UPLOAD_IMAGE_TYPES)[number]> {
    return checkImageFile(file, { allowedTypes: UPLOAD_IMAGE_TYPES, maxBytes: MAX_UPLOAD_BYTES });
}

/**
 * The size the browser downsizes to before uploading: longest edge at most
 * `UPLOAD_EDGE`, never enlarged, never below a pixel.
 */
export function uploadSize(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, UPLOAD_EDGE / Math.max(width, height));

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * Workers AI's codes for an account that has spent its day's neurons, as the
 * runtime prints them, and the sentence they come with. Matched on the detail
 * as well as on the worker's own code, so a worker deployed before it learned
 * to name the refusal still gets the right message.
 */
const ALLOWANCE_SPENT = /\b(?:4006|3036)\b|daily free allocation/i;

/** Workers AI's code for a model it has retired, and the word it uses. */
const MODEL_RETIRED = /\b5028\b|deprecated/i;

/**
 * The worker's own codes, mapped to reasons this side already has names for.
 * Read before the status, which cannot tell a spent day from an outage — both
 * have arrived as a 5xx.
 */
const WORKER_CODES: Record<string, GenerationFailureReason> = {
    UNAUTHORIZED: "unauthorized",
    INVALID_INPUT: "invalid_request",
    IMAGE_TOO_LARGE: "too_large",
    QUOTA_EXHAUSTED: "allowance_spent",
    MODEL_RETIRED: "model_retired",
    MODEL_ERROR: "upstream_unavailable",
    METHOD_NOT_ALLOWED: "invalid_request",
};

export function classifyWorkerFailure(
    status: number,
    code: string | null,
    detail: string,
): GenerationFailureReason {
    // The detail outranks a generic code: "MODEL_ERROR" with a 4006 in its
    // text is a spent day, and "try again shortly" is the wrong advice for one.
    if (ALLOWANCE_SPENT.test(detail)) {
        return "allowance_spent";
    }

    if (MODEL_RETIRED.test(detail)) {
        return "model_retired";
    }

    const named = code === null ? undefined : WORKER_CODES[code];

    if (named !== undefined) {
        return named;
    }

    if (status === 401 || status === 403) {
        return "unauthorized";
    }

    if (status === 413) {
        return "too_large";
    }

    return status >= 400 && status < 500 ? "invalid_request" : "upstream_unavailable";
}
