"use server";

import { headers } from "next/headers";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";

import { IMAGE_FORM_FIELD, TOKEN_FORM_FIELD } from "../domain/constants";
import { checkEquationImage } from "../domain/recognition";
import { requestEquationRecognition } from "../repository/math-ocr";
import type { RecognitionResult, RecognizedEquation } from "../types";
import { recognitionRequestSchema, recognizerResponseSchema } from "../validation/equation";

/**
 * Reads the equations in one picture.
 *
 * Order matters, and it is the same order every model-backed tool here uses:
 * the file is checked before the challenge, and the challenge before the model
 * call. An upload that could never be read must not cost a Turnstile
 * verification, and no request reaches the worker — whose model budget is
 * shared and finite — without a solved challenge behind it.
 *
 * `FormData` rather than a plain object, because that is the only shape a file
 * crosses the action boundary in.
 */
export async function recognizeEquations(formData: FormData): Promise<RecognitionResult> {
    const parsed = recognitionRequestSchema.safeParse({
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
    const checked = checkEquationImage({ type: image.type, size: image.size });

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const challenge = await verifyTurnstileToken(token, resolveRemoteIp(await headers()));

    if (!challenge.ok) {
        return { ok: false, reason: challenge.reason };
    }

    const response = await requestEquationRecognition(image);

    if (!response.ok) {
        return { ok: false, reason: response.reason };
    }

    const payload = recognizerResponseSchema.safeParse(response.payload);

    if (!payload.success) {
        logEvent("error", "equation.recognizer_unreadable_response");

        return { ok: false, reason: "unreadable_response" };
    }

    // The worker answers 200 with `success: false` when the model itself fails
    // or finds nothing. `requestEquationRecognition` already names every code it
    // knows; this catches a refusal that arrived without one.
    if (payload.data.success === false) {
        logEvent("error", "equation.recognizer_unnamed_refusal");

        return { ok: false, reason: "upstream_unavailable" };
    }

    const equations: RecognizedEquation[] = (payload.data.equations ?? [])
        .map((equation) => ({
            latex: typeof equation.latex === "string" ? equation.latex : "",
            // Absent or non-boolean reads as display mode. A block equation set
            // inline is cramped; an inline one set as a block is merely roomy,
            // and the reader has a switch either way.
            displayMode: typeof equation.displayMode === "boolean" ? equation.displayMode : true,
        }))
        .filter((equation) => equation.latex.trim().length > 0);

    // An empty array here means the model answered but transcribed nothing,
    // which is the same outcome for the reader as its own `EQUATION_NOT_DETECTED`
    // and keeps that name rather than inventing a second one for it.
    if (equations.length === 0) {
        return { ok: false, reason: "no_equation" };
    }

    return { ok: true, equations };
}
