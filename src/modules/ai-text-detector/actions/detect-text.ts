"use server";

import { headers } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import { containsBlockedWords } from "../domain/profanity";
import { checkDetectionText } from "../domain/text-check";
import { toDetectionVerdict } from "../domain/verdict";
import { requestDetection } from "../repository/text-detector";
import type { DetectionResult } from "../types";
import { detectionRequestSchema, detectorResponseSchema } from "../validation/detection";

/**
 * Runs one passage through the detection model.
 *
 * Order matters: the text is checked before the challenge, and the challenge
 * before the model call. A passage that could never be analysed must not cost
 * a Turnstile verification, and no request reaches the worker — whose daily
 * model budget is shared and finite — without a solved challenge behind it.
 */
export async function detectAiText(input: unknown): Promise<DetectionResult> {
    const parsed = detectionRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_request" };
    }

    const checked = checkDetectionText(parsed.data.text);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    // Re-checked here rather than trusted from the island: the browser gate is
    // one devtools edit away, and this is the point where a request would
    // otherwise reach the model.
    if (containsBlockedWords(checked.text)) {
        return { ok: false, reason: "blocked_language" };
    }

    const challenge = await verifyTurnstileToken(
        parsed.data.token,
        resolveRemoteIp(await headers()),
    );

    if (!challenge.ok) {
        return { ok: false, reason: challenge.reason };
    }

    const response = await requestDetection(checked.text);

    if (!response.ok) {
        return { ok: false, reason: response.reason };
    }

    const payload = detectorResponseSchema.safeParse(response.payload);

    if (!payload.success) {
        logEvent("error", "ai_text_detector.unreadable_response");

        return { ok: false, reason: "unreadable_response" };
    }

    // The worker answers 200 with an `error` field when the model itself fails.
    if (payload.data.error) {
        logEvent("error", "ai_text_detector.model_error", { message: payload.data.error });

        return { ok: false, reason: "upstream_unavailable" };
    }

    return { ok: true, verdict: toDetectionVerdict(payload.data) };
}
