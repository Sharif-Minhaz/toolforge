"use server";

import { headers } from "next/headers";

import { checkImageFile } from "@/modules/tools/domain/image-file";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";
import {
    IMAGE_FILE_LIMITS,
    IMAGE_FORM_FIELD,
    MASK_FILE_LIMITS,
    MASK_FORM_FIELD,
    TOKEN_FORM_FIELD,
} from "../domain/constants";
import { requestWatermarkRemoval } from "../repository/watermark-remover";
import type { WatermarkRemovalResult } from "../types";
import { watermarkRemovalRequestSchema } from "../validation/removal";

/**
 * Repaints one square of one picture.
 *
 * Order matters: the files are checked before the challenge, and the challenge
 * before the model call. An upload that could never be repainted must not cost a
 * Turnstile verification, and no request reaches the worker — whose model budget
 * is shared and finite — without a solved challenge behind it.
 *
 * `FormData` rather than a plain object, because that is the only shape a file
 * crosses the action boundary in.
 */
export async function removeWatermark(formData: FormData): Promise<WatermarkRemovalResult> {
    const image = formData.get(IMAGE_FORM_FIELD);
    const mask = formData.get(MASK_FORM_FIELD);
    const parsed = watermarkRemovalRequestSchema.safeParse({
        token: formData.get(TOKEN_FORM_FIELD),
        image,
        mask,
    });

    if (!parsed.success) {
        // Told apart rather than collapsed into one reason: "pick a picture" and
        // "paint over the watermark" are different things to go and do.
        if (!(image instanceof File)) {
            return { ok: false, reason: "missing_image" };
        }

        if (!(mask instanceof File)) {
            return { ok: false, reason: "missing_mask" };
        }

        return { ok: false, reason: "challenge_required" };
    }

    // Re-checked here rather than trusted from the island: the browser gate is
    // one devtools edit away, and this is the point where a request would
    // otherwise reach the model.
    const checkedImage = checkImageFile(
        { type: parsed.data.image.type, size: parsed.data.image.size },
        IMAGE_FILE_LIMITS,
    );

    if (!checkedImage.ok) {
        return { ok: false, reason: checkedImage.reason };
    }

    const checkedMask = checkImageFile(
        { type: parsed.data.mask.type, size: parsed.data.mask.size },
        MASK_FILE_LIMITS,
    );

    if (!checkedMask.ok) {
        // An empty mask is the reader's doing — they painted nothing. Anything
        // else about a mask this tool generated itself is a malformed request.
        return {
            ok: false,
            reason: checkedMask.reason === "empty_file" ? "empty_mask" : "invalid_request",
        };
    }

    const challenge = await verifyTurnstileToken(
        parsed.data.token,
        resolveRemoteIp(await headers()),
    );

    if (!challenge.ok) {
        return { ok: false, reason: challenge.reason };
    }

    const response = await requestWatermarkRemoval(parsed.data.image, parsed.data.mask);

    if (!response.ok) {
        return { ok: false, reason: response.reason };
    }

    // Base64 rather than raw bytes: a data URL is what the island has to hand to
    // an `<img>` and to the compositing canvas, so encoding it once here beats
    // every caller doing it again.
    return {
        ok: true,
        patch: {
            dataUrl: `data:image/png;base64,${Buffer.from(response.png).toString("base64")}`,
            bytes: response.png.byteLength,
        },
    };
}
