import { MAX_HOSTNAME_LENGTH, MAX_INPUT_LENGTH, MAX_LABEL_LENGTH } from "./constants";
import { isIpAddress } from "./ip";

/**
 * The half of the input check that needs no Public Suffix List.
 *
 * It is its own module so the browser can run it. `hostname.ts` imports
 * `tldts`, which carries the whole suffix list, and pulling that into the
 * client bundle to tell somebody they typed a space would be a poor trade.
 * Everything here is string work.
 *
 * The split is also what lets the island reject a typo *before* it spends a
 * Turnstile token and a round trip — and before it moves the page to a result
 * area that is never going to fill.
 */

export type HostSyntaxFailure = "empty_input" | "too_long" | "invalid_hostname";

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/** LDH: letters, digits, hyphen — and never a hyphen at either end. */
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * `new URL` is the IDNA implementation here: it is specified rather than
 * host-derived, so Bun, Node and every browser agree on what `münchen.de`
 * becomes. A bare IPv6 literal is handled before it, because the URL parser
 * requires the brackets that nobody types.
 */
export function extractHostname(input: string): string | null {
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
 * Syntax only. A single-label name passes here and is refused by
 * `readHostInput` for having no public suffix, because "there is no registry
 * for `localhost`" is a more useful thing to be told than "that is not a
 * hostname".
 */
export function isWellFormedHostname(hostname: string): boolean {
    return hostname
        .split(".")
        .every((label) => label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label));
}

/** `null` when the input is worth sending to a resolver. */
export function checkHostSyntax(input: string): HostSyntaxFailure | null {
    if (input.trim().length === 0) {
        return "empty_input";
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return "too_long";
    }

    const hostname = extractHostname(input);

    if (hostname === null) {
        return "invalid_hostname";
    }

    if (hostname.length > MAX_HOSTNAME_LENGTH) {
        return "too_long";
    }

    return isIpAddress(hostname) || isWellFormedHostname(hostname) ? null : "invalid_hostname";
}
