import {
    DEFAULT_REGEX_DELIMITER,
    DEFAULT_REGEX_FLAGS,
    DEFAULT_REGEX_MODE,
    DEFAULT_REPLACEMENT,
} from "./constants";
import { formatFlagLetters } from "./flags";
import type { RegexDelimiter, RegexFlag, RegexMode } from "../types";

/**
 * Builds the link that reopens the tool exactly as it stands.
 *
 * Only values that differ from the defaults are written, so the common case
 * stays short and readable rather than repeating what the page would have
 * chosen anyway.
 */

/**
 * Browsers accept far more, but proxies, chat clients, and mail readers start
 * truncating well before their limits — and a truncated regex link is worse
 * than a short one, because it still looks like it worked.
 */
export const MAX_SHARE_URL_LENGTH = 2_000;

export type ShareRequest = {
    /** Root-relative path of the tool page, e.g. `/tools/regex`. */
    readonly path: string;
    readonly pattern: string;
    readonly flags: readonly RegexFlag[];
    readonly mode: RegexMode;
    readonly delimiter: RegexDelimiter;
    readonly replacement: string;
    readonly testString: string;
};

export type ShareResult =
    | {
          readonly ok: true;
          readonly url: string;
          /** The test string was dropped to fit; the UI has to say so. */
          readonly omittedTestString: boolean;
      }
    | { readonly ok: false; readonly reason: "too_long" };

function buildUrl(request: ShareRequest, includeTestString: boolean): string {
    const params = new URLSearchParams();

    if (request.pattern.length > 0) {
        params.set("pattern", request.pattern);
    }

    const flagLetters = formatFlagLetters(request.flags);

    if (flagLetters !== formatFlagLetters(DEFAULT_REGEX_FLAGS)) {
        params.set("flags", flagLetters);
    }

    if (request.mode !== DEFAULT_REGEX_MODE) {
        params.set("mode", request.mode);
    }

    if (request.delimiter !== DEFAULT_REGEX_DELIMITER) {
        params.set("delimiter", request.delimiter);
    }

    if (request.replacement !== DEFAULT_REPLACEMENT) {
        params.set("replacement", request.replacement);
    }

    // Written even when empty, so a shared link that deliberately starts blank
    // does not fall back to the sample document.
    if (includeTestString) {
        params.set("test", request.testString);
    }

    const query = params.toString();

    return query.length === 0 ? request.path : `${request.path}?${query}`;
}

export function buildShareUrl(request: ShareRequest): ShareResult {
    const full = buildUrl(request, true);

    if (full.length <= MAX_SHARE_URL_LENGTH) {
        return { ok: true, url: full, omittedTestString: false };
    }

    // The test string is almost always what blew the budget, and it is the one
    // part the recipient can paste back themselves.
    const withoutInput = buildUrl(request, false);

    return withoutInput.length <= MAX_SHARE_URL_LENGTH
        ? { ok: true, url: withoutInput, omittedTestString: true }
        : { ok: false, reason: "too_long" };
}
