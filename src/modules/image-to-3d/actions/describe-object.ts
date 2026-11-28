"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp, verifyTurnstileToken } from "@/modules/tools/repository/turnstile";

import { IMAGE_FORM_FIELD, TOKEN_FORM_FIELD } from "../domain/constants";
import { checkUploadImage } from "../domain/generation";
import { requestObjectDescription } from "../repository/object-describer";
import { spendGenerationQuota, sweepGenerationQuotaRows } from "../repository/quota";
import type { GenerationResult } from "../types";
import { describeRequestSchema, workerResponseSchema } from "../validation/model-options";
import { parseObjectSpec } from "../validation/object-spec";

/**
 * Describes the object in one picture as primitives the browser can build.
 *
 * The order is the one every model-backed tool here uses, and each step is
 * placed by what it costs: the file is checked before the challenge, the
 * challenge before the quota, and the quota before the model. An upload that
 * could never be read must not cost a Turnstile verification, and no request
 * reaches the worker — whose allowance is shared and finite — without a solved
 * challenge and a counted slot behind it.
 *
 * Only the description comes back. The mesh is built in the reader's tab from
 * it, so a change of height or detail never costs a second model call.
 */
export async function describeObject(formData: FormData): Promise<GenerationResult> {
    const parsed = describeRequestSchema.safeParse({
        token: formData.get(TOKEN_FORM_FIELD),
        image: formData.get(IMAGE_FORM_FIELD),
    });

    if (!parsed.success) {
        return {
            ok: false,
            reason: formData.get(TOKEN_FORM_FIELD) ? "missing_image" : "challenge_missing",
        };
    }

    const { image, token } = parsed.data;

    // Re-checked here rather than trusted from the island: the browser gate is
    // one devtools edit away, and this is the point where a request would
    // otherwise reach the model.
    const checked = checkUploadImage({ type: image.type, size: image.size });

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    // An unreadable address still meters: everything behind one opaque proxy
    // shares a bucket, which is worse for them and no gap at all.
    const address = resolveRemoteIp(await headers()) ?? "unknown";
    const challenge = await verifyTurnstileToken(token, address);

    if (!challenge.ok) {
        return {
            ok: false,
            reason:
                challenge.reason === "challenge_failed"
                    ? "challenge_failed"
                    : challenge.reason === "not_configured"
                      ? "not_configured"
                      : "challenge_unavailable",
        };
    }

    // `null` is a limiter that could not run — no database, no salt, a thrown
    // statement. It refuses, rather than falling open onto an allowance that
    // other tools share.
    const spent = await spendGenerationQuota(address);

    if (spent === null) {
        return { ok: false, reason: "quota_unavailable" };
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened.
        after(() => sweepGenerationQuotaRows());
    }

    if (!spent.verdict.allowed) {
        return {
            ok: false,
            reason: spent.verdict.bucket === "deployment" ? "site_limited" : "rate_limited",
        };
    }

    const response = await requestObjectDescription(
        new Uint8Array(await image.arrayBuffer()),
        checked.type,
    );

    if (!response.ok) {
        return { ok: false, reason: response.reason };
    }

    const payload = workerResponseSchema.safeParse(response.payload);

    if (!payload.success) {
        logEvent("error", "image_to_3d.unreadable_worker_response");

        return { ok: false, reason: "unreadable_response" };
    }

    const [choice] = payload.data.result.choices;

    // A truncated answer is unreadable JSON; saying so by name keeps it out of
    // the parser's generic refusal in the logs. The neurons it burned are
    // logged with it, because a model that rambles to the ceiling is the one
    // case that costs the allowance ten times over.
    if (choice.finish_reason === "length") {
        logEvent("warn", "image_to_3d.answer_truncated", {
            neurons: payload.data.result.usage?.neurons ?? -1,
        });

        return { ok: false, reason: "unreadable_response" };
    }

    const spec = parseObjectSpec(choice.message.content ?? "");

    if (!spec.ok) {
        return { ok: false, reason: spec.reason };
    }

    return { ok: true, spec: spec.spec };
}
