import type {
    CodeOptions,
    CodeTarget,
    CurlDirection,
    CurlOptions,
    HttpVersion,
    IndentWidth,
    ShellDialect,
    TransferOptions,
} from "../types";

export const DEFAULT_DIRECTION: CurlDirection = "curlToCode";

export const DEFAULT_CODE_OPTIONS: CodeOptions = {
    target: "fetch",
    runtime: "browser",
    style: "asyncAwait",
    headersStyle: "object",
    includeResponse: true,
    indent: "two",
};

export const DEFAULT_CURL_OPTIONS: CurlOptions = {
    shell: "posix",
    longFlags: false,
    multiLine: true,
    explicitMethod: false,
};

/**
 * A request with nothing switched on. Every parser starts here and turns things
 * on, so a field can never be left undefined by a branch that forgot it.
 */
export const EMPTY_TRANSFER: TransferOptions = {
    followRedirects: false,
    maxRedirects: null,
    insecure: false,
    compressed: false,
    proxy: null,
    proxyUser: null,
    maxTimeSeconds: null,
    connectTimeoutSeconds: null,
    httpVersion: "default",
    clientCert: null,
    clientKey: null,
    caCert: null,
    unixSocket: null,
    retry: null,
    outputPath: null,
    includeHeaders: false,
    headOnly: false,
    verbose: false,
    silent: false,
    failFast: false,
    netrc: false,
    interfaceName: null,
    resolve: [],
    cookieFile: null,
    credentials: null,
    mode: null,
    cache: null,
    integrity: null,
    keepalive: false,
};

/**
 * Ceiling on one conversion. Everything runs on the main thread, and a command
 * this long is a paste accident rather than a request.
 */
export const MAX_CURL_INPUT_LENGTH = 200_000;

/** Longest `?input=` value accepted from a shared link. */
export const MAX_SHARED_INPUT_LENGTH = 4096;

/** curl's own default when a URL names no scheme. */
export const DEFAULT_SCHEME = "https";

/** What curl sends with `-d` unless a header says otherwise. */
export const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

export const JSON_CONTENT_TYPE = "application/json";

export const MULTIPART_CONTENT_TYPE = "multipart/form-data";

/** Proper names, not copy — these are the labels a picker shows verbatim. */
export const HTTP_VERSION_LABELS: Record<HttpVersion, string> = {
    default: "",
    http10: "HTTP/1.0",
    http11: "HTTP/1.1",
    http2: "HTTP/2",
    http3: "HTTP/3",
};

/** The flag that selects each version. `--http2-prior-knowledge` and
 *  `--http3-only` also read as their base version, so this is write-only. */
export const HTTP_VERSION_FLAGS: Record<Exclude<HttpVersion, "default">, string> = {
    http10: "http1.0",
    http11: "http1.1",
    http2: "http2",
    http3: "http3",
};

export const INDENT_SPACES: Record<IndentWidth, string> = {
    two: "  ",
    four: "    ",
};

/** The mark that carries a command onto the next line, per dialect. */
export const LINE_CONTINUATION: Record<ShellDialect, string> = {
    posix: " \\\n",
    cmd: " ^\n",
    powershell: " `\n",
};

/** PowerShell aliases `curl` to `Invoke-WebRequest`, which takes none of this. */
export const CURL_COMMAND: Record<ShellDialect, string> = {
    posix: "curl",
    cmd: "curl",
    powershell: "curl.exe",
};

export const MIME_TYPE: Record<CodeTarget | "curl", string> = {
    curl: "text/x-shellscript;charset=utf-8",
    fetch: "text/javascript;charset=utf-8",
    axios: "text/javascript;charset=utf-8",
    nodeHttp: "text/javascript;charset=utf-8",
};

export const SAMPLE_CURL = `curl 'https://api.example.com/v1/users?page=2&per_page=25' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json' \\
  -H 'X-Request-Id: 8f14e45f' \\
  -b 'session=abc123; theme=dark' \\
  -u 'ada:lovelace' \\
  --compressed \\
  -L \\
  --max-time 15 \\
  --data-raw '{"name":"Ada Lovelace","role":"admin","tags":["founder","maths"]}'`;

export const SAMPLE_FETCH = `const response = await fetch("https://api.example.com/v1/users?page=2", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Bearer sk_live_8f14e45f",
  },
  body: JSON.stringify({
    name: "Ada Lovelace",
    role: "admin",
  }),
  credentials: "include",
  redirect: "follow",
  signal: AbortSignal.timeout(15000),
});

const data = await response.json();`;
