import "server-only";

import { after } from "next/server";

import { checkPublicUrl } from "@/modules/tools/domain/public-url";
import { fetchRemoteImage } from "@/modules/tools/repository/remote-image";

import { MAX_PREVIEW_IMAGE_BYTES } from "../domain/constants";
import { readImageSize } from "../domain/image-size";
import { readPreviewTags } from "../domain/tags";
import { picturesToProbe } from "../domain/urls";
import type {
    ImageProbe,
    ImageProbeFailure,
    ImageProbeResult,
    InspectionResult,
    PreviewAllowance,
} from "../types";
import { fetchPreviewPage, LINK_PREVIEW_USER_AGENT } from "./fetch-page";
import { isPreviewQuotaConfigured, spendPreviewQuota, sweepPreviewQuotaRows } from "./quota";

/**
 * One check, and the gates it passes on the way.
 *
 * Shared by the Server Action and the MCP adapter rather than living in either,
 * because the quota is not about who is asking — a second entry point that
 * skipped it would be the unmetered fetcher the quota exists to prevent.
 *
 * The order is the argument:
 *
 * 1. **URL shape**, free and local. A typo must not cost a database write.
 * 2. **Quota before the network**, because it is the only gate that bounds
 *    volume. It fails closed.
 * 3. **The address guard inside each fetch**, on what DNS returned rather than
 *    what was typed, and again on every redirect hop.
 *
 * The allowance is spent whether or not the page answers. A check that failed
 * and cost nothing is a free retry loop, and retrying is what an abuser does.
 */

export type InspectionRun = {
    readonly url: string;
    /**
     * What the per-caller counter is keyed on: a visitor's address from the
     * page, or a literal for a caller with no address here. Never a value a
     * caller chooses.
     */
    readonly callerKey: string;
    readonly now?: Date;
};

type Spent =
    | { readonly ok: true; readonly allowance: PreviewAllowance }
    | {
          readonly ok: false;
          readonly reason: "rate_limited" | "not_configured";
          readonly allowance?: PreviewAllowance;
      };

async function spend(callerKey: string, host: string, now: Date): Promise<Spent> {
    if (!isPreviewQuotaConfigured()) {
        return { ok: false, reason: "not_configured" };
    }

    const spent = await spendPreviewQuota(callerKey, host, now);

    if (spent === null) {
        return { ok: false, reason: "not_configured" };
    }

    const allowance: PreviewAllowance = {
        remaining: spent.verdict.remaining,
        resetsAt: spent.verdict.resetsAt,
    };

    if (!spent.verdict.allowed) {
        return { ok: false, reason: "rate_limited", allowance };
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened.
        after(() => sweepPreviewQuotaRows());
    }

    return { ok: true, allowance };
}

/** The shared fetcher's vocabulary, narrowed to what a probe can actually return. */
function probeReason(reason: string): ImageProbeFailure {
    switch (reason) {
        case "invalid_url":
        case "scheme_not_allowed":
        case "blocked_address":
        case "too_many_redirects":
        case "not_an_image":
        case "too_large":
        case "empty_response":
        case "timed_out":
            return reason;
        default:
            return "upstream_failed";
    }
}

/** Fetches one picture and reads its size. Never throws; a failure is a probe too. */
async function probeImage(url: string): Promise<ImageProbe> {
    const fetched = await fetchRemoteImage(url, {
        maxBytes: MAX_PREVIEW_IMAGE_BYTES,
        userAgent: LINK_PREVIEW_USER_AGENT,
    });

    if (!fetched.ok) {
        return { ok: false, url, reason: probeReason(fetched.reason) };
    }

    const size = readImageSize(new Uint8Array(fetched.bytes));

    return {
        ok: true,
        url,
        type: fetched.type,
        bytes: fetched.bytes.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        dataUrl: `data:${fetched.type};base64,${fetched.bytes.toString("base64")}`,
    };
}

export async function runPreviewInspection(run: InspectionRun): Promise<InspectionResult> {
    const now = run.now ?? new Date();
    const checked = checkPublicUrl(run.url);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const spent = await spend(run.callerKey, checked.url.hostname, now);

    if (!spent.ok) {
        return spent;
    }

    const fetched = await fetchPreviewPage(checked.url.toString());

    if (!fetched.ok) {
        return { ok: false, reason: fetched.reason, allowance: spent.allowance };
    }

    const tags = readPreviewTags(fetched.html);
    const images = await Promise.all(
        picturesToProbe(tags, new URL(fetched.facts.finalUrl)).map(probeImage),
    );

    return {
        ok: true,
        page: fetched.facts,
        tags,
        images,
        fetchedAt: now.toISOString(),
        allowance: spent.allowance,
    };
}

/**
 * Measures one picture for the paste mode, under the same quota.
 *
 * Keyed on the picture's host, because in this mode there is no page host —
 * the markup came from the reader, and the only stranger this server touches
 * is whoever serves the image.
 */
export async function runImageProbe(run: InspectionRun): Promise<ImageProbeResult> {
    const now = run.now ?? new Date();
    const checked = checkPublicUrl(run.url);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    const spent = await spend(run.callerKey, checked.url.hostname, now);

    if (!spent.ok) {
        return spent;
    }

    return {
        ok: true,
        probe: await probeImage(checked.url.toString()),
        allowance: spent.allowance,
    };
}
