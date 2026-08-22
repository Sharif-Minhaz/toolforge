import { parse } from "tldts";

import { checkHostSyntax, extractHostname } from "@/modules/tools/domain/host-syntax";
import { isIpAddress } from "@/modules/tools/domain/ip";

import { MAX_INPUT_LENGTH } from "./constants";
import type { LookupFailureReason } from "../types";

/**
 * Turns whatever the reader pasted into the one apex the index can be asked
 * about.
 *
 * The upstream requires an **eTLD+1** and refuses anything else with a 400 that
 * names the apex it wanted. Rather than spend a round trip and a quota unit to
 * be told that, this narrows the input here: `https://api.staging.example.co.uk/x`
 * becomes `example.co.uk`, and the report says the lookup was widened so nobody
 * is left thinking they asked about `api.staging`.
 *
 * Narrowing rather than refusing is the right call because the wider answer
 * *contains* the narrower one — every name under `api.staging.example.co.uk` is
 * also a name under `example.co.uk`, so the reader gets a superset of what they
 * asked for and is told as much. A refusal would make them delete labels by
 * hand to learn the same thing.
 *
 * Pure, and the only place the input is interpreted. It imports `tldts` for the
 * Public Suffix List, which is why the browser runs `checkHostSyntax` on its own
 * before calling the action — see `tools/domain/host-syntax.ts`.
 */

export type ApexInputResult =
    | {
          readonly ok: true;
          readonly apex: string;
          /** The hostname typed, when it was below the apex. `null` when it was the apex. */
          readonly narrowedFrom: string | null;
      }
    | { readonly ok: false; readonly reason: ApexInputFailureReason };

export type ApexInputFailureReason = Extract<
    LookupFailureReason,
    "empty_input" | "too_long" | "invalid_hostname" | "unknown_suffix" | "ip_address"
>;

export function readApexInput(input: string): ApexInputResult {
    const syntax = checkHostSyntax(input, MAX_INPUT_LENGTH);

    if (syntax !== null) {
        return { ok: false, reason: syntax };
    }

    // Non-null by construction: `checkHostSyntax` returned no complaint.
    const hostname = extractHostname(input) ?? "";

    // An address has no registrable domain, so there is nothing to enumerate.
    // Told here rather than by the upstream, because "that is an IP address" is
    // a more useful sentence than "not an apex".
    if (isIpAddress(hostname)) {
        return { ok: false, reason: "ip_address" };
    }

    const parsed = parse(hostname);

    // No ICANN entry in the Public Suffix List means there is no registry the
    // index could have been built from — `.local`, `.internal`, a bare label,
    // or a private suffix somebody else's users create names under.
    if (parsed.domain === null || parsed.publicSuffix === null || parsed.isIcann !== true) {
        return { ok: false, reason: "unknown_suffix" };
    }

    const apex = parsed.domain.toLowerCase();

    return { ok: true, apex, narrowedFrom: apex === hostname ? null : hostname };
}
