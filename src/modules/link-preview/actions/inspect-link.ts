"use server";

import { headers } from "next/headers";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

import { runImageProbe, runPreviewInspection } from "../repository/inspect";
import type { ImageProbeResult, InspectionResult } from "../types";
import { imageProbeRequestSchema, inspectionRequestSchema } from "../validation/preview-request";

/**
 * The page's two calls: check a URL, or measure one picture for the paste mode.
 *
 * **No Turnstile**, for the image importer's reason: this reads a public page
 * and hands what it found straight back to the person who typed the address. It
 * cannot enumerate anything the caller could not have fetched themselves, and a
 * puzzle in front of a tool people re-run ten times while fixing their tags
 * would cost every reader something to save the one abuser a rate-limited ten
 * minutes. The quota inside the orchestrator is the gate shaped like the risk.
 */

async function callerKey(): Promise<string | undefined> {
    return resolveRemoteIp(await headers());
}

export async function inspectLink(input: unknown): Promise<InspectionResult> {
    const parsed = inspectionRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_url" };
    }

    const remoteIp = await callerKey();

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "link_preview.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    try {
        return await runPreviewInspection({ url: parsed.data.url, callerKey: remoteIp });
    } catch (caught) {
        logEvent("error", "link_preview.inspection_threw", { error: describeError(caught) });

        return { ok: false, reason: "upstream_failed" };
    }
}

export async function probeLinkImage(input: unknown): Promise<ImageProbeResult> {
    const parsed = imageProbeRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_url" };
    }

    const remoteIp = await callerKey();

    if (remoteIp === undefined) {
        logEvent("error", "link_preview.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    try {
        return await runImageProbe({ url: parsed.data.url, callerKey: remoteIp });
    } catch (caught) {
        logEvent("error", "link_preview.probe_threw", { error: describeError(caught) });

        return { ok: false, reason: "upstream_failed" };
    }
}
