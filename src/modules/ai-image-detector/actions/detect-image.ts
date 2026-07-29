"use server";

import { headers } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { checkImageFile } from "@/modules/tools/domain/image-file";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { IMAGE_FILE_LIMITS, IMAGE_FORM_FIELD, TOKEN_FORM_FIELD } from "../domain/constants";
import { toImageVerdict } from "../domain/verdict";
import { requestImageDetection } from "../repository/image-detector";
import type { ImageDetectionResult } from "../types";
import { imageDetectionRequestSchema, imageDetectorResponseSchema } from "../validation/detection";

/**
 * Runs one picture through the detection model.
 *
 * Order matters: the file is checked before the challenge, and the challenge
 * before the model call. An upload that could never be analysed must not cost a
 * Turnstile verification, and no request reaches the worker — whose daily model
 * budget is shared and finite — without a solved challenge behind it.
 *
 * `FormData` rather than a plain object, because that is the only shape a file
 * crosses the action boundary in.
 */
export async function detectAiImage(formData: FormData): Promise<ImageDetectionResult> {
    const parsed = imageDetectionRequestSchema.safeParse({
        token: formData.get(TOKEN_FORM_FIELD),
        image: formData.get(IMAGE_FORM_FIELD),
    });

    if (!parsed.success) {
        return { ok: false, reason: "missing_image" };
    }

    const { image, token } = parsed.data;

    // Re-checked here rather than trusted from the island: the browser gate is
    // one devtools edit away, and this is the point where a request would
    // otherwise reach the model.
    const checked = checkImageFile({ type: image.type, size: image.size }, IMAGE_FILE_LIMITS);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const challenge = await verifyTurnstileToken(token, resolveRemoteIp(await headers()));

    if (!challenge.ok) {
        return { ok: false, reason: challenge.reason };
    }

    const response = await requestImageDetection(image);

    if (!response.ok) {
        return { ok: false, reason: response.reason };
    }

    const payload = imageDetectorResponseSchema.safeParse(response.payload);

    if (!payload.success) {
        logEvent("error", "ai_image_detector.unreadable_response");

        return { ok: false, reason: "unreadable_response" };
    }

    // The worker answers 200 with `success: false` when the model itself fails.
    if (payload.data.success === false || payload.data.error) {
        logEvent("error", "ai_image_detector.model_error", {
            message: payload.data.error ?? "",
        });

        return { ok: false, reason: "upstream_unavailable" };
    }

    if (!payload.data.result) {
        logEvent("error", "ai_image_detector.empty_result");

        return { ok: false, reason: "unreadable_response" };
    }

    return { ok: true, verdict: toImageVerdict(payload.data.result) };
}
