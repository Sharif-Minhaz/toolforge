import type { SecretEncoding } from "../types";
import { countCharacters } from "./encodings";

/**
 * The shell pipeline that produces the same thing this tool just did.
 *
 * Here because the command is the reason most people arrive: somebody pasted
 * `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` into a README years ago
 * and it has been copied ever since, mostly without the two `tr` calls being
 * explained. Printing the exact equivalent of the current settings turns the
 * tool into the explanation of the command rather than a replacement for it.
 *
 * Every line here was run against OpenSSL 3.0.13 and GNU coreutils before it
 * was written down, including the two wrap widths below — a command that is
 * *nearly* right is worse than none, because the person who pastes it gets a
 * secret with a newline in the middle and no reason to suspect one.
 */

/**
 * The two `tr` stages, named.
 *
 * Exported because the article explains them one row at a time, and a command
 * fragment quoted in the message catalogue would be a second copy to keep in
 * step — as well as a string ICU has to be told not to read, since an
 * apostrophe there escapes whatever follows it. They are code, so they are
 * data.
 */
export const BASE64URL_SWAP_STAGE = "tr '+/' '-_'";

export const PADDING_STRIP_STAGE = "tr -d '='";

export function randStage(byteLength: number, encoding: SecretEncoding): string {
    return encoding === "base32"
        ? `openssl rand ${byteLength}`
        : `openssl rand -base64 ${byteLength}`;
}

/** `openssl enc -base64` breaks its output every 64 characters. */
const OPENSSL_BASE64_WRAP = 64;

/** GNU `base32` breaks its output every 76. */
const COREUTILS_BASE32_WRAP = 76;

/**
 * Both encoders always pad, so the wrap is decided by the padded width whatever
 * the reader asked for.
 */
function wraps(byteLength: number, encoding: SecretEncoding): boolean {
    const width = encoding === "base32" ? COREUTILS_BASE32_WRAP : OPENSSL_BASE64_WRAP;

    return countCharacters(byteLength, encoding, true) > width;
}

/**
 * The characters a single `tr -d` has to remove: the padding when it was not
 * asked for, and the line breaks whenever the output is long enough to have
 * them. One call rather than two, because `tr` takes a set and a reader copying
 * this is better served by the shortest correct pipeline.
 */
function deletions(byteLength: number, encoding: SecretEncoding, padded: boolean): string {
    const set = `${padded ? "" : "="}${wraps(byteLength, encoding) ? "\\n" : ""}`;

    return set === "" ? "" : ` | tr -d '${set}'`;
}

/**
 * Total, because every encoding this tool offers has an honest one-liner.
 *
 * That is a fact about the four, not a guarantee about any fifth: base58 was
 * considered and left out precisely because no portable pipeline produces it,
 * and adding it would mean this returning a refusal rather than a command.
 */
export function equivalentCommand(
    byteLength: number,
    encoding: SecretEncoding,
    padded: boolean,
): string {
    if (encoding === "hex") {
        // Never wraps and has no padding, so the whole of it is one call.
        return `openssl rand -hex ${byteLength}`;
    }

    const tail = deletions(byteLength, encoding, padded);

    if (encoding === "base32") {
        // `base32` is GNU coreutils, not OpenSSL — it is absent from a stock
        // macOS. The article says so; there is no portable alternative worth
        // printing in its place.
        return `${randStage(byteLength, encoding)} | base32${tail}`;
    }

    // The two `tr` calls are the whole difference between base64 and base64url:
    // the alphabet swap, then the padding that a URL would percent-encode.
    const alphabet = encoding === "base64url" ? ` | ${BASE64URL_SWAP_STAGE}` : "";

    return `${randStage(byteLength, encoding)}${alphabet}${tail}`;
}
