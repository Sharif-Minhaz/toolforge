/**
 * The tool converts in two directions, and both meet in the middle at
 * `HttpRequest`. Nothing here ever rewrites one syntax into the other directly:
 * a shell command is parsed into the request it describes, and the request is
 * then written out in whichever language was asked for. That is what keeps
 * `curl → fetch` and `fetch → curl` from drifting into two different opinions
 * about what a flag means.
 */

export const CURL_DIRECTIONS = ["curlToCode", "codeToCurl"] as const;

export type CurlDirection = (typeof CURL_DIRECTIONS)[number];

/**
 * Languages the request can be written in. Only `fetch` is also *read* — the
 * other two are output-only, because a round trip needs a parser per language
 * and axios has three ways to spell every option.
 */
export const CODE_TARGETS = ["fetch", "axios", "nodeHttp"] as const;

export type CodeTarget = (typeof CODE_TARGETS)[number];

/**
 * Where the snippet is meant to run. It is not cosmetic: Node's `fetch` is
 * undici, which takes a `dispatcher` and so can express `--insecure` and
 * `--proxy`, and axios only has `httpsAgent`, `proxy` and `maxRedirects` there
 * at all. A browser has none of them, and forbids several headers outright.
 */
export const FETCH_RUNTIMES = ["browser", "node"] as const;

export type FetchRuntime = (typeof FETCH_RUNTIMES)[number];

export const CODE_STYLES = ["asyncAwait", "promiseChain"] as const;

export type CodeStyle = (typeof CODE_STYLES)[number];

export const HEADERS_STYLES = ["object", "headersInstance"] as const;

export type HeadersStyle = (typeof HEADERS_STYLES)[number];

/** Named rather than numeric so the message key stays a literal union. */
export const INDENT_WIDTHS = ["two", "four"] as const;

export type IndentWidth = (typeof INDENT_WIDTHS)[number];

export type CodeOptions = {
    readonly target: CodeTarget;
    /** Applies to `fetch` and axios; `node:https` is Node by definition. */
    readonly runtime: FetchRuntime;
    /** Applies to everything but `nodeHttp`, which is callback-driven. */
    readonly style: CodeStyle;
    /** Applies to `fetch` only; axios and `node:https` take a plain object. */
    readonly headersStyle: HeadersStyle;
    /** Appends the status check and the body read after the call. */
    readonly includeResponse: boolean;
    readonly indent: IndentWidth;
};

/**
 * How a shell command is quoted. Also what the reader's pasted command is
 * detected as — Chrome, Firefox and Safari all offer "Copy as cURL" in each of
 * these three, and they escape nothing alike.
 */
export const SHELL_DIALECTS = ["posix", "cmd", "powershell"] as const;

export type ShellDialect = (typeof SHELL_DIALECTS)[number];

export type CurlOptions = {
    readonly shell: ShellDialect;
    /** `--header` rather than `-H`. */
    readonly longFlags: boolean;
    /** Breaks the command across lines with the dialect's continuation mark. */
    readonly multiLine: boolean;
    /** Writes `-X GET` and `-X POST` even where curl would infer them. */
    readonly explicitMethod: boolean;
};

/* ------------------------------------------------------------- request --- */

export type HttpHeader = {
    readonly name: string;
    readonly value: string;
};

export type KeyValue = {
    readonly key: string;
    readonly value: string;
};

export const AUTH_SCHEMES = ["basic", "bearer", "digest", "ntlm", "negotiate"] as const;

export type AuthScheme = (typeof AUTH_SCHEMES)[number];

export type HttpAuth = {
    readonly scheme: AuthScheme;
    /** Empty for `bearer` and `negotiate`. */
    readonly user: string;
    readonly password: string;
    /** Set for `bearer` only. */
    readonly token: string;
};

export type MultipartPart = {
    readonly name: string;
    /** The literal value, or the path when `filename` is set. */
    readonly value: string;
    /** Set when the part reads a file — `-F "photo=@shot.png"`. */
    readonly filename: string | null;
    readonly contentType: string | null;
};

export const BODY_KINDS = ["none", "raw", "json", "urlencoded", "multipart", "file"] as const;

export type BodyKind = (typeof BODY_KINDS)[number];

export type HttpBody =
    | { readonly kind: "none" }
    | { readonly kind: "raw"; readonly text: string }
    /** Text that parsed as JSON. Kept as text, so what was typed survives. */
    | { readonly kind: "json"; readonly text: string }
    | { readonly kind: "urlencoded"; readonly fields: readonly KeyValue[] }
    | { readonly kind: "multipart"; readonly parts: readonly MultipartPart[] }
    | { readonly kind: "file"; readonly path: string; readonly binary: boolean };

export const HTTP_VERSIONS = ["default", "http10", "http11", "http2", "http3"] as const;

export type HttpVersion = (typeof HTTP_VERSIONS)[number];

/**
 * Everything about the transfer rather than the message. Split out because this
 * is the half that survives translation least: a browser's `fetch` can express
 * perhaps a third of it, and each language loses a different third.
 */
export type TransferOptions = {
    readonly followRedirects: boolean;
    readonly maxRedirects: number | null;
    readonly insecure: boolean;
    readonly compressed: boolean;
    readonly proxy: string | null;
    readonly proxyUser: string | null;
    /** `--max-time`, the ceiling on the whole transfer. */
    readonly maxTimeSeconds: number | null;
    readonly connectTimeoutSeconds: number | null;
    readonly httpVersion: HttpVersion;
    readonly clientCert: string | null;
    readonly clientKey: string | null;
    readonly caCert: string | null;
    readonly unixSocket: string | null;
    readonly retry: number | null;
    /** `-o`; a filename, or the empty string for `-O`. */
    readonly outputPath: string | null;
    readonly includeHeaders: boolean;
    readonly headOnly: boolean;
    readonly verbose: boolean;
    readonly silent: boolean;
    readonly failFast: boolean;
    readonly netrc: boolean;
    readonly interfaceName: string | null;
    readonly resolve: readonly string[];
    /** A cookie jar path from `-b <file>` or `-c <file>`, never a pair list. */
    readonly cookieFile: string | null;
    /** Set by a `fetch` init that named it; curl has no equivalent. */
    readonly credentials: string | null;
    readonly mode: string | null;
    readonly cache: string | null;
    readonly integrity: string | null;
    readonly keepalive: boolean;
};

/**
 * One HTTP request, independent of the syntax it arrived in.
 *
 * `query` and `cookies` are held apart from `url` and `headers` so the Request
 * tab can list them, but they are derived views: the URL still carries its own
 * query string, and re-emitting merges the cookies back into one header.
 */
export type HttpRequest = {
    readonly method: string;
    readonly url: string;
    readonly query: readonly KeyValue[];
    readonly headers: readonly HttpHeader[];
    readonly cookies: readonly KeyValue[];
    readonly auth: HttpAuth | null;
    readonly body: HttpBody;
    readonly transfer: TransferOptions;
};

/* ------------------------------------------------------------- failure --- */

export type CurlFailureReason =
    | "empty"
    | "too_long"
    | "not_curl"
    | "unbalanced_quote"
    | "missing_value"
    | "no_request_call"
    | "unsupported_expression"
    | "no_url"
    | "invalid_url";

export type CurlFailure = {
    readonly ok: false;
    readonly reason: CurlFailureReason;
    /** The flag or expression that could not be read, when there is one. */
    readonly token?: string;
};

/* --------------------------------------------------------------- notes --- */

/**
 * Everything a conversion could not carry across unchanged. Each id is a
 * message key, so the catalogue is checked at compile time.
 *
 * `dropped` means the option is gone and the request now behaves differently.
 * `adapted` means it survived as something that does not look like it.
 */
export const CONVERSION_NOTES = [
    "insecureTls",
    "insecureViaDispatcher",
    "proxy",
    "proxyViaDispatcher",
    "maxRedirects",
    "redirectManual",
    "redirectFollows",
    "redirectsNotFollowed",
    "httpVersion",
    "clientCert",
    "caCert",
    "unixSocket",
    "cookieFile",
    "cookieHeaderForbidden",
    "bodyFromFile",
    "multipartFile",
    "multipartBoundary",
    "multipartUnsupported",
    "digestAuth",
    "negotiateAuth",
    "netrc",
    "outputFile",
    "transportOnly",
    "compressedAutomatic",
    "interfaceName",
    "resolveHost",
    "retry",
    "headOnly",
    "connectTimeout",
    "timeoutAsSignal",
    "implicitContentType",
    "getWithBody",
    "refererAsOption",
    "credentialsIgnored",
    "fetchOnlyInit",
    "unknownFlag",
    "nextRequest",
    "shellCannotQuoteNewline",
    "shellCannotQuotePercent",
    "templatePlaceholder",
] as const;

export type ConversionNoteId = (typeof CONVERSION_NOTES)[number];

export type ConversionNoteKind = "dropped" | "adapted";

export type ConversionNote = {
    readonly id: ConversionNoteId;
    readonly kind: ConversionNoteKind;
    /** Interpolated into the message — a flag, a path, a header name. */
    readonly detail?: string;
};

/* ---------------------------------------------------------- conversion --- */

export type ConversionRequest = {
    readonly direction: CurlDirection;
    readonly input: string;
    readonly code: CodeOptions;
    readonly curl: CurlOptions;
};

export type ConversionSuccess = {
    readonly ok: true;
    readonly request: HttpRequest;
    readonly output: string;
    readonly notes: readonly ConversionNote[];
    /** Which dialect the pasted command was read as. Null going the other way. */
    readonly detectedShell: ShellDialect | null;
};

export type ConversionResult = ConversionSuccess | CurlFailure;

export type CurlExportRequest = {
    readonly direction: CurlDirection;
    readonly target: CodeTarget;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
