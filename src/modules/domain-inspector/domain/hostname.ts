import { parse } from "tldts";

import {
    checkHostSyntax,
    extractHostname,
    type HostSyntaxFailure,
} from "@/modules/tools/domain/host-syntax";
import { isIpAddress } from "@/modules/tools/domain/ip";
import { MAX_INPUT_LENGTH } from "./constants";
import { toUnicodeHostname } from "./punycode";
import type { DomainBreakdown } from "../types";

/**
 * Turns whatever the reader pasted — a bare name, a full URL, an IDN, an
 * address — into the single ASCII hostname every lookup is keyed on, plus the
 * Public Suffix List breakdown the first panel renders.
 *
 * Pure, and the only place the input is interpreted. Every layer downstream
 * receives a hostname it may trust to be syntactically well formed; whether it
 * is safe to *connect* to is a separate question, answered by `ip.ts`.
 *
 * The syntax half lives in `tools/domain/host-syntax.ts` so the browser can run it without
 * downloading the suffix list — see that file for why.
 */

export type HostInputFailureReason = HostSyntaxFailure | "unknown_suffix";

export type HostInputResult =
    | { readonly ok: true; readonly breakdown: DomainBreakdown }
    | { readonly ok: false; readonly reason: HostInputFailureReason };

export function readHostInput(input: string): HostInputResult {
    const syntax = checkHostSyntax(input, MAX_INPUT_LENGTH);

    if (syntax !== null) {
        return { ok: false, reason: syntax };
    }

    // Non-null by construction: `checkHostSyntax` returned no complaint.
    const hostname = extractHostname(input) ?? "";

    if (isIpAddress(hostname)) {
        return {
            ok: true,
            breakdown: {
                hostname,
                unicode: hostname,
                labels: [hostname],
                subdomain: null,
                registrableDomain: null,
                publicSuffix: null,
                isIcannSuffix: false,
                isIp: true,
                punycoded: false,
            },
        };
    }

    const parsed = parse(hostname);

    // No entry in the Public Suffix List means nothing here can look it up:
    // there is no registry to ask, and `.local` or `.internal` resolving at all
    // would mean resolving it against this server's own network.
    if (parsed.publicSuffix === null || parsed.isIcann !== true) {
        return { ok: false, reason: "unknown_suffix" };
    }

    const unicode = toUnicodeHostname(hostname);

    return {
        ok: true,
        breakdown: {
            hostname,
            unicode,
            labels: hostname.split("."),
            subdomain:
                parsed.subdomain !== null && parsed.subdomain.length > 0 ? parsed.subdomain : null,
            registrableDomain: parsed.domain,
            publicSuffix: parsed.publicSuffix,
            isIcannSuffix: true,
            isIp: false,
            punycoded: unicode !== hostname,
        },
    };
}
