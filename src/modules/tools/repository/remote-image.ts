import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { SITE_NAME, SITE_URL } from "@/modules/seo/domain/site";
import type { DecodableImageType } from "@/modules/tools/types";

import { checkPublicUrl } from "../domain/public-url";
import {
    MAX_REMOTE_IMAGE_BYTES,
    MAX_REMOTE_IMAGE_REDIRECTS,
    REMOTE_IMAGE_CONNECT_TIMEOUT_MS,
    REMOTE_IMAGE_TOTAL_TIMEOUT_MS,
    remoteImageType,
    type RemoteImageProblem,
} from "../domain/remote-image";
import { guardAddresses } from "./address-guard";

/**
 * Downloads a picture from a host the reader named.
 *
 * The dangerous half of the URL import, and it follows the rules the Domain
 * Inspector established for exactly this shape of problem:
 *
 * **Resolve first, then connect to the address you checked.** Checking the name
 * proves nothing — `images.attacker.example` is a perfectly public name that
 * resolves to `169.254.169.254`, and reading the cloud metadata service is
 * precisely what an unguarded fetcher is for. Checking a name's addresses and
 * then connecting *by name* re-resolves it, so a record with a one-second TTL
 * can answer publicly for the check and privately for the connection. That is
 * why `fetch` is not used here: it cannot be told which address to connect to.
 * `node:https` can, through `lookup`.
 *
 * **Every redirect hop is a new host and a new decision.** Each is re-checked,
 * re-resolved and re-guarded, and the chain is capped.
 *
 * **The body is capped while it streams**, not after. Reading a response into
 * memory and measuring it afterwards is how a four-gigabyte reply kills the
 * process — and "give me a picture" is an invitation to send one.
 *
 * **Nothing is forwarded either way.** No cookie, no authorization header, no
 * referrer goes out; nothing but the bytes and their declared type comes back.
 * The far end sees this server's address and a user agent naming this site,
 * which the copy in the tool says plainly.
 */

export type RemoteImageFetch =
    | {
          readonly ok: true;
          readonly bytes: Buffer;
          readonly type: DecodableImageType;
          readonly url: URL;
      }
    | { readonly ok: false; readonly reason: RemoteImageProblem };

export async function fetchRemoteImage(rawUrl: string): Promise<RemoteImageFetch> {
    let target = rawUrl;

    for (let hop = 0; hop <= MAX_REMOTE_IMAGE_REDIRECTS; hop += 1) {
        const checked = checkPublicUrl(target);

        if (!checked.ok) {
            return { ok: false, reason: checked.reason };
        }

        const resolved = await resolveGuarded(checked.url.hostname);

        if (resolved === null) {
            return { ok: false, reason: "blocked_address" };
        }

        const hopResult = await sendOnce(checked.url, resolved);

        if (!hopResult.ok) {
            return hopResult;
        }

        if (hopResult.kind === "redirect") {
            // Resolved against the current URL so a relative `Location` works,
            // then run through the whole check again from the top.
            target = new URL(hopResult.location, checked.url).toString();
            continue;
        }

        return { ok: true, bytes: hopResult.bytes, type: hopResult.type, url: checked.url };
    }

    return { ok: false, reason: "too_many_redirects" };
}

/** The addresses a name answers with, minus everything the guard refuses. */
async function resolveGuarded(
    hostname: string,
): Promise<{ address: string; family: 4 | 6 } | null> {
    try {
        const answers = await lookup(hostname, { all: true, verbatim: true });
        const guard = guardAddresses(
            answers.map((answer) => answer.address),
            "remote_image",
        );

        if (!guard.ok) {
            return null;
        }

        const chosen = answers.find((answer) => guard.addresses.includes(answer.address));

        return chosen === undefined
            ? null
            : { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
    } catch (caught) {
        logEvent("warn", "remote_image.resolve_failed", { error: describeError(caught) });

        return null;
    }
}

type HopOutcome =
    | { readonly ok: true; readonly kind: "redirect"; readonly location: string }
    | {
          readonly ok: true;
          readonly kind: "body";
          readonly bytes: Buffer;
          readonly type: DecodableImageType;
      }
    | { readonly ok: false; readonly reason: RemoteImageProblem };

function sendOnce(url: URL, resolved: { address: string; family: 4 | 6 }): Promise<HopOutcome> {
    return new Promise((resolve) => {
        const send = url.protocol === "https:" ? httpsRequest : httpRequest;
        let settled = false;

        function finish(outcome: HopOutcome) {
            if (!settled) {
                settled = true;
                resolve(outcome);
            }
        }

        const request = send(
            {
                protocol: url.protocol,
                // The address, never the hostname — re-resolving here would
                // hand the decision back to whoever controls the record.
                host: resolved.address,
                family: resolved.family,
                port: url.port === "" ? undefined : Number(url.port),
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: {
                    // Set here rather than forwarded, so the far end sees the
                    // name it was addressed by while the socket goes to the
                    // address that was checked. TLS needs `servername` for the
                    // same reason.
                    host: url.host,
                    accept: "image/*",
                    "accept-encoding": "identity",
                    "user-agent": `${SITE_NAME}-ImageImport/1.0 (+${SITE_URL})`,
                },
                servername: url.protocol === "https:" ? url.hostname : undefined,
                timeout: REMOTE_IMAGE_CONNECT_TIMEOUT_MS,
                // Nothing here should ever reach a resolver again.
                lookup: (_hostname, _options, callback) => {
                    callback(null, resolved.address, resolved.family);
                },
            },
            (response) => {
                const status = response.statusCode ?? 0;
                const location = response.headers.location;

                if (status >= 300 && status < 400 && location !== undefined) {
                    // Nothing worth reading on a redirect, and the next hop has
                    // to be guarded before a single byte is spent on it.
                    response.destroy();
                    finish({ ok: true, kind: "redirect", location });

                    return;
                }

                if (status < 200 || status >= 300) {
                    response.destroy();
                    finish({ ok: false, reason: "upstream_failed" });

                    return;
                }

                const type = remoteImageType(response.headers["content-type"]);

                // Refused on the header rather than after the download: a URL
                // pointing at a 200 MB video is a mistake worth catching before
                // the bytes are spent, and an HTML error page served with 200
                // is the single most common thing behind a "broken" image link.
                if (type === null) {
                    response.destroy();
                    finish({ ok: false, reason: "not_an_image" });

                    return;
                }

                const declared = Number(response.headers["content-length"] ?? Number.NaN);

                if (Number.isFinite(declared) && declared > MAX_REMOTE_IMAGE_BYTES) {
                    response.destroy();
                    finish({ ok: false, reason: "too_large" });

                    return;
                }

                const chunks: Buffer[] = [];
                let received = 0;
                let overflowed = false;

                response.on("data", (chunk: Buffer) => {
                    // Capped while it streams. A `content-length` is a claim,
                    // not a promise, so the real ceiling is enforced here.
                    if (received + chunk.length > MAX_REMOTE_IMAGE_BYTES) {
                        overflowed = true;
                        response.destroy();

                        return;
                    }

                    received += chunk.length;
                    chunks.push(chunk);
                });

                response.on("end", () => {
                    if (received === 0) {
                        finish({ ok: false, reason: "empty_response" });

                        return;
                    }

                    finish({ ok: true, kind: "body", bytes: Buffer.concat(chunks), type });
                });

                response.on("close", () => {
                    // A destroyed stream never emits `end`, so the overflow
                    // case has to settle here or the promise would hang. A
                    // truncated picture is refused rather than returned: half a
                    // JPEG decodes to half a JPEG.
                    if (overflowed) {
                        finish({ ok: false, reason: "too_large" });
                    }
                });
            },
        );

        const deadline = setTimeout(() => {
            request.destroy();
            finish({ ok: false, reason: "timed_out" });
        }, REMOTE_IMAGE_TOTAL_TIMEOUT_MS);

        request.on("timeout", () => {
            request.destroy();
            finish({ ok: false, reason: "timed_out" });
        });

        request.on("error", (caught) => {
            logEvent("warn", "remote_image.request_failed", { error: describeError(caught) });
            finish({ ok: false, reason: "upstream_failed" });
        });

        request.on("close", () => clearTimeout(deadline));

        request.end();
    });
}
