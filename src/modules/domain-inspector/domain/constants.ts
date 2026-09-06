import { DEFAULT_RESOLVER } from "@/modules/tools/domain/network-constants";
import type { InspectionOptions } from "../types";

/** RFC 1035: the wire form of a name is capped at 255 octets, 253 as text. */
export const MAX_HOSTNAME_LENGTH = 253;

/** RFC 1035 again — one label may not exceed 63 octets. */
export const MAX_LABEL_LENGTH = 63;

/**
 * The reader may paste a whole URL, so the accepted input is longer than a
 * hostname. Anything past this is not a mistyped address, it is a payload.
 */
export const MAX_INPUT_LENGTH = 2_048;

/**
 * Each panel gets its own budget, so one slow upstream cannot stall the rest.
 * The DNS and RDAP budgets belong to the shared transport and live with it in
 * `tools/domain/network-constants.ts`.
 */
export const TLS_TIMEOUT_MS = 8_000;
export const HTTP_TIMEOUT_MS = 10_000;

/**
 * Shorter than a single DNS lookup on purpose. Nine resolvers run at once and
 * the slowest sets the wall clock for the whole panel, so a node having a bad
 * day costs five seconds and reports itself unreachable — which is a result —
 * rather than holding the report open for six.
 */
export const PROPAGATION_TIMEOUT_MS = 5_000;

/**
 * Addresses looked up in the hosting panel. A large site answers with a dozen
 * A records, and every one of them costs a reverse lookup plus two registry
 * queries; four is enough to name the host without turning one press into
 * twenty round trips.
 */
export const MAX_INSPECTED_ADDRESSES = 4;

/** Redirect hops followed by the page probe before it gives up. */
export const MAX_REDIRECT_HOPS = 5;

/**
 * How much of the page body is read before the socket is dropped. Signatures
 * live in the head and the first script tags; the rest is only bandwidth this
 * server pays for on a stranger's behalf.
 */
export const MAX_HTML_BYTES = 512 * 1_024;

/** Fixed and honest, so an operator seeing it in their log can identify us. */
export const PROBE_USER_AGENT = "ToolForgeBot/1.0 (+https://toolforge.app/tools/domain-inspector)";

/** Names this widget in Cloudflare's dashboard. */
export const TURNSTILE_ACTION = "domain-inspector";

export const TOKEN_FIELD = "token";

export const DEFAULT_INSPECTION_OPTIONS: InspectionOptions = {
    resolver: DEFAULT_RESOLVER,
    probeSite: true,
};
