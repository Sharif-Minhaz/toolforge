"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { logEvent } from "@/modules/observability/domain/logger";

import { checkPublicUrl } from "../domain/public-url";
import { remoteImageFilename, type RemoteImageResult } from "../domain/remote-image";
import { fetchRemoteImage } from "../repository/remote-image";
import {
    isRemoteImageImportConfigured,
    spendRemoteImageQuota,
    sweepRemoteImageQuotaRows,
} from "../repository/remote-image-quota";
import { resolveRemoteIp } from "../repository/turnstile";
import { remoteImageRequestSchema } from "../validation/remote-image";

/**
 * Fetches one picture from a host the reader named, for whichever image tool
 * asked.
 *
 * The order of the gates is the security argument, and each is where it is for
 * a reason that is not obvious from outside:
 *
 * 1. **Shape, then URL syntax** — both free and local. A typo must not cost a
 *    database write, a DNS lookup or a packet.
 * 2. **Quota before the network**, because it is the only gate that bounds
 *    *volume*. Everything above it refuses one bad request; this is what
 *    refuses the thousandth good one. It fails closed.
 * 3. **Address guard inside the fetch**, on what DNS returned rather than on
 *    what was typed, and again on every redirect hop.
 *
 * The allowance is spent whether or not a picture comes back. An import that
 * failed and cost nothing is a free retry loop, and retrying is exactly what an
 * abuser does.
 *
 * No Turnstile. Unlike the Port Scanner and the Domain Inspector this reads a
 * public URL and hands the bytes straight back to the person who typed it — it
 * cannot enumerate anything the caller could not have fetched themselves, and
 * putting a challenge on every image tool's paste field would cost every reader
 * a puzzle to save the one abuser a rate-limited minute.
 */
export async function importRemoteImage(input: unknown): Promise<RemoteImageResult> {
    const parsed = remoteImageRequestSchema.safeParse(input);

    if (!parsed.success) {
        return { ok: false, reason: "invalid_url" };
    }

    const checked = checkPublicUrl(parsed.data.url);

    if (!checked.ok) {
        return { ok: false, reason: checked.reason };
    }

    if (!isRemoteImageImportConfigured()) {
        logEvent("warn", "remote_image.not_configured");

        return { ok: false, reason: "not_configured" };
    }

    const remoteIp = resolveRemoteIp(await headers());

    // No address means no way to meter the caller, and an unmeterable caller is
    // exactly the one this limit exists for.
    if (remoteIp === undefined) {
        logEvent("error", "remote_image.no_remote_ip");

        return { ok: false, reason: "rate_limited" };
    }

    const spent = await spendRemoteImageQuota(remoteIp, checked.url.hostname);

    if (spent === null || !spent.verdict.allowed) {
        return { ok: false, reason: spent === null ? "not_configured" : "rate_limited" };
    }

    if (spent.windowOpened) {
        // Off the response path, and only when a fresh window opened — at most
        // once a window per active server, usually deleting nothing.
        after(() => sweepRemoteImageQuotaRows());
    }

    const fetched = await fetchRemoteImage(parsed.data.url);

    if (!fetched.ok) {
        return { ok: false, reason: fetched.reason };
    }

    return {
        ok: true,
        image: {
            dataUrl: `data:${fetched.type};base64,${fetched.bytes.toString("base64")}`,
            filename: remoteImageFilename(fetched.url, fetched.type),
            type: fetched.type,
            bytes: fetched.bytes.byteLength,
        },
    };
}
