export type FlagArity = "none" | "value";

export type CurlFlag = {
    /** Long name without the leading `--`. */
    readonly long: string;
    /** Single-letter alias without the leading `-`, where curl has one. */
    readonly short?: string;
    readonly arity: FlagArity;
};

/**
 * The flags this tool understands. Two rules keep it honest:
 *
 * - Arity is recorded even for flags nothing acts on (`--limit-rate`), because
 *   getting the *arity* wrong is what makes a parser swallow the URL and report
 *   a command with no address in it. Being ignored is survivable; being
 *   mis-split is not.
 * - Aliases curl treats as the same option share one entry, so the parser
 *   switches on one name rather than on every spelling.
 */
const FLAGS: readonly CurlFlag[] = [
    // request line
    { long: "request", short: "X", arity: "value" },
    { long: "url", arity: "value" },
    { long: "get", short: "G", arity: "none" },
    { long: "head", short: "I", arity: "none" },
    { long: "next", arity: "none" },

    // headers
    { long: "header", short: "H", arity: "value" },
    { long: "user-agent", short: "A", arity: "value" },
    { long: "referer", short: "e", arity: "value" },
    { long: "range", short: "r", arity: "value" },
    { long: "compressed", arity: "none" },
    { long: "compressed-ssh", arity: "none" },

    // body
    { long: "data", short: "d", arity: "value" },
    { long: "data-raw", arity: "value" },
    { long: "data-ascii", arity: "value" },
    { long: "data-binary", arity: "value" },
    { long: "data-urlencode", arity: "value" },
    { long: "json", arity: "value" },
    { long: "form", short: "F", arity: "value" },
    { long: "form-string", arity: "value" },
    { long: "form-escape", arity: "none" },
    { long: "upload-file", short: "T", arity: "value" },

    // credentials
    { long: "user", short: "u", arity: "value" },
    { long: "oauth2-bearer", arity: "value" },
    { long: "basic", arity: "none" },
    { long: "digest", arity: "none" },
    { long: "ntlm", arity: "none" },
    { long: "negotiate", arity: "none" },
    { long: "anyauth", arity: "none" },
    { long: "netrc", short: "n", arity: "none" },
    { long: "netrc-optional", arity: "none" },
    { long: "netrc-file", arity: "value" },
    { long: "aws-sigv4", arity: "value" },

    // cookies
    { long: "cookie", short: "b", arity: "value" },
    { long: "cookie-jar", short: "c", arity: "value" },
    { long: "junk-session-cookies", short: "j", arity: "none" },

    // redirects
    { long: "location", short: "L", arity: "none" },
    { long: "location-trusted", arity: "none" },
    { long: "max-redirs", arity: "value" },
    { long: "post301", arity: "none" },
    { long: "post302", arity: "none" },
    { long: "post303", arity: "none" },

    // transport and TLS
    { long: "insecure", short: "k", arity: "none" },
    { long: "proxy", short: "x", arity: "value" },
    { long: "proxy-user", short: "U", arity: "value" },
    { long: "proxy-insecure", arity: "none" },
    { long: "preproxy", arity: "value" },
    { long: "noproxy", arity: "value" },
    { long: "cert", short: "E", arity: "value" },
    { long: "cert-type", arity: "value" },
    { long: "key", arity: "value" },
    { long: "key-type", arity: "value" },
    { long: "pass", arity: "value" },
    { long: "cacert", arity: "value" },
    { long: "capath", arity: "value" },
    { long: "unix-socket", arity: "value" },
    { long: "abstract-unix-socket", arity: "value" },
    { long: "interface", arity: "value" },
    { long: "resolve", arity: "value" },
    { long: "connect-to", arity: "value" },
    { long: "ipv4", short: "4", arity: "none" },
    { long: "ipv6", short: "6", arity: "none" },
    { long: "tcp-nodelay", arity: "none" },
    { long: "no-keepalive", arity: "none" },
    { long: "keepalive-time", arity: "value" },
    { long: "tlsv1", arity: "none" },
    { long: "tlsv1.0", arity: "none" },
    { long: "tlsv1.1", arity: "none" },
    { long: "tlsv1.2", arity: "none" },
    { long: "tlsv1.3", arity: "none" },
    { long: "ciphers", arity: "value" },
    { long: "sslv2", short: "2", arity: "none" },
    { long: "sslv3", short: "3", arity: "none" },

    // protocol version
    { long: "http0.9", arity: "none" },
    { long: "http1.0", short: "0", arity: "none" },
    { long: "http1.1", arity: "none" },
    { long: "http2", arity: "none" },
    { long: "http2-prior-knowledge", arity: "none" },
    { long: "http3", arity: "none" },
    { long: "http3-only", arity: "none" },

    // timing and retries
    { long: "max-time", short: "m", arity: "value" },
    { long: "connect-timeout", arity: "value" },
    { long: "expect100-timeout", arity: "value" },
    { long: "speed-limit", short: "Y", arity: "value" },
    { long: "speed-time", short: "y", arity: "value" },
    { long: "limit-rate", arity: "value" },
    { long: "retry", arity: "value" },
    { long: "retry-delay", arity: "value" },
    { long: "retry-max-time", arity: "value" },
    { long: "retry-connrefused", arity: "none" },
    { long: "retry-all-errors", arity: "none" },

    // output and diagnostics
    { long: "output", short: "o", arity: "value" },
    { long: "remote-name", short: "O", arity: "none" },
    { long: "remote-header-name", short: "J", arity: "none" },
    { long: "create-dirs", arity: "none" },
    { long: "continue-at", short: "C", arity: "value" },
    { long: "include", short: "i", arity: "none" },
    { long: "verbose", short: "v", arity: "none" },
    { long: "silent", short: "s", arity: "none" },
    { long: "show-error", short: "S", arity: "none" },
    { long: "fail", short: "f", arity: "none" },
    { long: "fail-with-body", arity: "none" },
    { long: "fail-early", arity: "none" },
    { long: "progress-bar", short: "#", arity: "none" },
    { long: "no-progress-meter", arity: "none" },
    { long: "no-buffer", short: "N", arity: "none" },
    { long: "write-out", short: "w", arity: "value" },
    { long: "dump-header", short: "D", arity: "value" },
    { long: "trace", arity: "value" },
    { long: "trace-ascii", arity: "value" },
    { long: "trace-time", arity: "none" },
    { long: "styled-output", arity: "none" },

    // miscellaneous
    { long: "config", short: "K", arity: "value" },
    { long: "globoff", short: "g", arity: "none" },
    { long: "disable", short: "q", arity: "none" },
    { long: "parallel", short: "Z", arity: "none" },
    { long: "path-as-is", arity: "none" },
    { long: "max-filesize", arity: "value" },
    { long: "proto", arity: "value" },
    { long: "proto-default", arity: "value" },
    { long: "proto-redir", arity: "value" },
    { long: "raw", arity: "none" },
    { long: "ssl-no-revoke", arity: "none" },
];

const BY_LONG = new Map(FLAGS.map((flag) => [flag.long, flag]));

const BY_SHORT = new Map(
    FLAGS.filter((flag) => flag.short !== undefined).map((flag) => [flag.short as string, flag]),
);

export function findLongFlag(name: string): CurlFlag | undefined {
    return BY_LONG.get(name);
}

export function findShortFlag(letter: string): CurlFlag | undefined {
    return BY_SHORT.get(letter);
}

/**
 * Whether a token looks like an address rather than a value belonging to the
 * flag in front of it. Used only for long flags this table does not carry,
 * where curl's own arity is unknowable: guessing "takes a value" would eat the
 * URL, and guessing "takes none" would promote the value to one.
 */
export function looksLikeUrl(token: string): boolean {
    if (token.includes("://")) {
        return true;
    }

    return /^[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:[/?#]|$)/.test(token);
}
