import { parse } from "tldts";

import { MAX_HOSTNAME_LENGTH, MAX_INPUT_LENGTH, MAX_LABEL_LENGTH } from "./constants";
import { isIpAddress } from "./ip";
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
 */

export type HostInputFailureReason =
    "empty_input" | "too_long" | "invalid_hostname" | "unknown_suffix";

export type HostInputResult =
    | { readonly ok: true; readonly breakdown: DomainBreakdown }
    | { readonly ok: false; readonly reason: HostInputFailureReason };

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/** LDH: letters, digits, hyphen — and never a hyphen at either end. */
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * `new URL` is the IDNA implementation here: it is specified rather than
 * host-derived, so Bun, Node and every browser agree on what `münchen.de`
 * becomes. A bare IPv6 literal is handled before it, because the URL parser
 * requires the brackets that nobody types.
 */
function extractHostname(input: string): string | null {
    const trimmed = input.trim();

    if (isIpAddress(trimmed)) {
        return trimmed.toLowerCase();
    }

    try {
        const url = new URL(SCHEME_PATTERN.test(trimmed) ? trimmed : `http://${trimmed}`);
        const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");

        // A root-relative trailing dot is valid DNS and meaningless to every
        // registry below, so it goes here rather than in six later callers.
        const withoutRootDot = host.replace(/\.+$/, "").toLowerCase();

        return withoutRootDot.length > 0 ? withoutRootDot : null;
    } catch {
        return null;
    }
}

/**
 * Syntax only. A single-label name passes here and is refused below for having
 * no public suffix, because "there is no registry for `localhost`" is a more
 * useful thing to be told than "that is not a hostname".
 */
function isWellFormedHostname(hostname: string): boolean {
    return hostname
        .split(".")
        .every((label) => label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label));
}

export function readHostInput(input: string): HostInputResult {
    if (input.trim().length === 0) {
        return { ok: false, reason: "empty_input" };
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const hostname = extractHostname(input);

    if (hostname === null) {
        return { ok: false, reason: "invalid_hostname" };
    }

    if (hostname.length > MAX_HOSTNAME_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

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

    if (!isWellFormedHostname(hostname)) {
        return { ok: false, reason: "invalid_hostname" };
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
