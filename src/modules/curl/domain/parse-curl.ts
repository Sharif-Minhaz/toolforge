import type {
    ConversionNote,
    CurlFailure,
    HttpAuth,
    HttpBody,
    HttpHeader,
    HttpRequest,
    HttpVersion,
    KeyValue,
    MultipartPart,
    ShellDialect,
    TransferOptions,
} from "../types";
import {
    EMPTY_TRANSFER,
    FORM_CONTENT_TYPE,
    JSON_CONTENT_TYPE,
    MAX_CURL_INPUT_LENGTH,
} from "./constants";
import { findLongFlag, findShortFlag, looksLikeUrl } from "./flags";
import {
    defaultHeader,
    isCookieFile,
    parseCookiePairs,
    parseHeaderArgument,
    removeHeader,
    setHeader,
    splitCookies,
} from "./headers";
import { detectShellDialect, stripPrompt, tokenize } from "./tokenize";
import { appendQuery, ensureScheme, parseUrlEncodedBody, percentEncode, queryOf } from "./url";

export type CurlParseResult =
    | {
          readonly ok: true;
          readonly request: HttpRequest;
          readonly notes: readonly ConversionNote[];
          readonly shell: ShellDialect;
      }
    | CurlFailure;

const CURL_COMMAND_PATTERN = /^curl(?:\.exe)?$/i;

type DataChunk = {
    /** Already in the form it will be sent as. */
    readonly text: string;
    /** Set when the chunk names a file this tool cannot read. */
    readonly file: string | null;
    readonly binary: boolean;
};

/**
 * `--data-urlencode` has five shapes and they do not all encode the same half
 * of the argument. Getting this wrong sends `name%3Dvalue` as one opaque blob.
 */
function encodeUrlencodeArgument(argument: string): DataChunk {
    if (argument.startsWith("@")) {
        return { text: "", file: argument.slice(1), binary: false };
    }

    if (argument.startsWith("=")) {
        return { text: percentEncode(argument.slice(1)), file: null, binary: false };
    }

    const at = argument.indexOf("@");
    const equals = argument.indexOf("=");

    // `name@file` reads the file for the value; `name=content` encodes only the
    // right-hand side; anything else is a bare value with no name at all.
    if (at > 0 && (equals === -1 || at < equals)) {
        return { text: "", file: argument.slice(at + 1), binary: false };
    }

    if (equals > 0) {
        return {
            text: `${argument.slice(0, equals)}=${percentEncode(argument.slice(equals + 1))}`,
            file: null,
            binary: false,
        };
    }

    return { text: percentEncode(argument), file: null, binary: false };
}

/** `photo=@shot.png;type=image/png` and the four other things `-F` accepts. */
function parseFormArgument(argument: string, literal: boolean): MultipartPart | null {
    const equals = argument.indexOf("=");

    if (equals <= 0) {
        return null;
    }

    const name = argument.slice(0, equals);
    const rest = argument.slice(equals + 1);

    if (literal) {
        return { name, value: rest, filename: null, contentType: null };
    }

    const fromFile = rest.startsWith("@") || rest.startsWith("<");

    if (!fromFile) {
        const [value, ...params] = rest.split(";");
        const type = params
            .map((param) => param.trim())
            .find((param) => param.toLowerCase().startsWith("type="));

        return {
            name,
            value,
            filename: null,
            contentType: type ? type.slice("type=".length) : null,
        };
    }

    const [path, ...params] = rest.slice(1).split(";");
    let filename = path;
    let contentType: string | null = null;

    for (const raw of params) {
        const param = raw.trim();

        if (param.toLowerCase().startsWith("type=")) {
            contentType = param.slice("type=".length);
        } else if (param.toLowerCase().startsWith("filename=")) {
            filename = param.slice("filename=".length);
        }
    }

    return { name, value: path, filename, contentType };
}

/**
 * Reads a pasted command into the request it describes.
 *
 * Nothing here throws: a command a person types is user input, so every way it
 * can be wrong is a reason on a typed failure. The one thing it refuses to
 * guess at is arity — see `looksLikeUrl`.
 */
export function parseCurl(input: string): CurlParseResult {
    const text = input.trim();

    if (text.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (text.length > MAX_CURL_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const shell = detectShellDialect(text);
    const tokenized = tokenize(stripPrompt(text), shell);

    if (!tokenized.ok) {
        return { ok: false, reason: tokenized.reason };
    }

    const commandAt = tokenized.tokens.findIndex((token) => CURL_COMMAND_PATTERN.test(token));

    if (commandAt === -1) {
        return { ok: false, reason: "not_curl" };
    }

    const tokens = tokenized.tokens.slice(commandAt + 1);
    const notes: ConversionNote[] = [];

    let headers: readonly HttpHeader[] = [];
    let cookies: readonly KeyValue[] = [];
    let transfer: TransferOptions = { ...EMPTY_TRANSFER };
    const positional: string[] = [];
    const dataChunks: DataChunk[] = [];
    const formParts: MultipartPart[] = [];

    // Held on one object rather than as loose `let`s: these are written inside
    // `applyLongFlag` and read after the walk, and TypeScript's flow analysis
    // does not follow an assignment made inside a nested function — so a plain
    // `let x: string | null = null` reads back as `null` forever.
    const state: {
        explicitMethod: string | null;
        jsonBody: string | null;
        uploadFile: string | null;
        authUser: string | null;
        bearerToken: string | null;
        authScheme: HttpAuth["scheme"];
        asGet: boolean;
        stopped: boolean;
    } = {
        explicitMethod: null,
        jsonBody: null,
        uploadFile: null,
        authUser: null,
        bearerToken: null,
        authScheme: "basic",
        asGet: false,
        stopped: false,
    };

    function note(id: ConversionNote["id"], kind: ConversionNote["kind"], detail?: string) {
        notes.push(detail === undefined ? { id, kind } : { id, kind, detail });
    }

    function applyLongFlag(name: string, value: string | null, negated: boolean): void {
        const on = !negated;

        switch (name) {
            case "request":
                state.explicitMethod = value;
                break;
            case "url":
                if (value !== null) {
                    positional.push(value);
                }
                break;
            case "get":
                state.asGet = on;
                break;
            case "head":
                transfer = { ...transfer, headOnly: on };
                break;
            case "next":
                state.stopped = true;
                note("nextRequest", "dropped");
                break;

            case "header":
                if (value !== null) {
                    const parsed = parseHeaderArgument(value);

                    if (parsed !== null && "header" in parsed) {
                        headers = [...headers, parsed.header];
                    } else if (parsed !== null) {
                        headers = removeHeader(headers, parsed.removes);
                    }
                }
                break;
            case "user-agent":
                if (value !== null) {
                    headers = setHeader(headers, "User-Agent", value);
                }
                break;
            case "referer":
                if (value !== null) {
                    headers = setHeader(headers, "Referer", value.replace(/;auto$/, ""));
                }
                break;
            case "range":
                if (value !== null) {
                    headers = setHeader(headers, "Range", `bytes=${value}`);
                }
                break;
            case "compressed":
                transfer = { ...transfer, compressed: on };
                break;

            case "data":
            case "data-ascii":
                if (value !== null) {
                    dataChunks.push(
                        value.startsWith("@")
                            ? { text: "", file: value.slice(1), binary: false }
                            : { text: value, file: null, binary: false },
                    );
                }
                break;
            case "data-raw":
                if (value !== null) {
                    dataChunks.push({ text: value, file: null, binary: false });
                }
                break;
            case "data-binary":
                if (value !== null) {
                    dataChunks.push(
                        value.startsWith("@")
                            ? { text: "", file: value.slice(1), binary: true }
                            : { text: value, file: null, binary: true },
                    );
                }
                break;
            case "data-urlencode":
                if (value !== null) {
                    dataChunks.push(encodeUrlencodeArgument(value));
                }
                break;
            case "json":
                if (value !== null) {
                    state.jsonBody = value;
                }
                break;
            case "form":
            case "form-string":
                if (value !== null) {
                    const part = parseFormArgument(value, name === "form-string");

                    if (part !== null) {
                        formParts.push(part);
                    }
                }
                break;
            case "upload-file":
                state.uploadFile = value;
                break;

            case "user":
                state.authUser = value;
                break;
            case "oauth2-bearer":
                state.bearerToken = value;
                break;
            case "basic":
            case "digest":
            case "ntlm":
            case "negotiate":
                state.authScheme = name;
                break;
            case "netrc":
            case "netrc-optional":
                transfer = { ...transfer, netrc: on };
                break;

            case "cookie":
                if (value !== null) {
                    if (isCookieFile(value)) {
                        transfer = { ...transfer, cookieFile: value };
                    } else {
                        cookies = [...cookies, ...parseCookiePairs(value)];
                    }
                }
                break;
            case "cookie-jar":
                transfer = { ...transfer, cookieFile: value };
                break;

            case "location":
            case "location-trusted":
                transfer = { ...transfer, followRedirects: on };
                break;
            case "max-redirs":
                transfer = { ...transfer, maxRedirects: value === null ? null : Number(value) };
                break;

            case "insecure":
                transfer = { ...transfer, insecure: on };
                break;
            case "proxy":
                transfer = { ...transfer, proxy: value };
                break;
            case "proxy-user":
                transfer = { ...transfer, proxyUser: value };
                break;
            case "cert":
                transfer = { ...transfer, clientCert: value };
                break;
            case "key":
                transfer = { ...transfer, clientKey: value };
                break;
            case "cacert":
            case "capath":
                transfer = { ...transfer, caCert: value };
                break;
            case "unix-socket":
            case "abstract-unix-socket":
                transfer = { ...transfer, unixSocket: value };
                break;
            case "interface":
                transfer = { ...transfer, interfaceName: value };
                break;
            case "resolve":
            case "connect-to":
                if (value !== null) {
                    transfer = { ...transfer, resolve: [...transfer.resolve, value] };
                }
                break;

            case "http1.0":
            case "http1.1":
            case "http2":
            case "http2-prior-knowledge":
            case "http3":
            case "http3-only": {
                const versions: Record<string, HttpVersion> = {
                    "http1.0": "http10",
                    "http1.1": "http11",
                    http2: "http2",
                    "http2-prior-knowledge": "http2",
                    http3: "http3",
                    "http3-only": "http3",
                };

                transfer = { ...transfer, httpVersion: versions[name] };
                break;
            }

            case "max-time":
                transfer = { ...transfer, maxTimeSeconds: value === null ? null : Number(value) };
                break;
            case "connect-timeout":
                transfer = {
                    ...transfer,
                    connectTimeoutSeconds: value === null ? null : Number(value),
                };
                break;
            case "retry":
                transfer = { ...transfer, retry: value === null ? null : Number(value) };
                break;

            case "output":
                transfer = { ...transfer, outputPath: value };
                break;
            case "remote-name":
                transfer = { ...transfer, outputPath: "" };
                break;
            case "include":
                transfer = { ...transfer, includeHeaders: on };
                break;
            case "verbose":
                transfer = { ...transfer, verbose: on };
                break;
            case "silent":
                transfer = { ...transfer, silent: on };
                break;
            case "fail":
            case "fail-with-body":
                transfer = { ...transfer, failFast: on };
                break;

            default:
                // In the table, so its arity was known and its value consumed —
                // it simply has no bearing on the request that gets built.
                break;
        }
    }

    let index = 0;

    while (index < tokens.length && !state.stopped) {
        const token = tokens[index];

        if (token.startsWith("--")) {
            const body = token.slice(2);
            const equals = body.indexOf("=");
            const rawName = equals === -1 ? body : body.slice(0, equals);
            const inlineValue = equals === -1 ? null : body.slice(equals + 1);
            const negated = rawName.startsWith("no-") && findLongFlag(rawName) === undefined;
            const name = negated ? rawName.slice(3) : rawName;
            const flag = findLongFlag(name);

            if (flag === undefined) {
                note("unknownFlag", "dropped", token);

                // Arity is unknowable for a flag this table has never heard of.
                // Consuming the next token would eat the URL; refusing to
                // consume it would promote a value to one. The next token only
                // becomes a value when it can be neither a flag nor an address.
                const next = tokens[index + 1];

                if (
                    inlineValue === null &&
                    next !== undefined &&
                    !next.startsWith("-") &&
                    !looksLikeUrl(next)
                ) {
                    index += 2;
                    continue;
                }

                index += 1;
                continue;
            }

            if (flag.arity === "none") {
                applyLongFlag(flag.long, null, negated);
                index += 1;
                continue;
            }

            if (inlineValue !== null) {
                applyLongFlag(flag.long, inlineValue, negated);
                index += 1;
                continue;
            }

            const value = tokens[index + 1];

            if (value === undefined) {
                return { ok: false, reason: "missing_value", token };
            }

            applyLongFlag(flag.long, value, negated);
            index += 2;
            continue;
        }

        if (token.startsWith("-") && token.length > 1) {
            // curl lets boolean shorts bundle — `-sSL` — and the last letter in
            // a bundle may still take a value, either as the rest of the token
            // or as the token after it.
            let letterAt = 1;
            let consumedNext = false;

            while (letterAt < token.length) {
                const letter = token[letterAt];
                const flag = findShortFlag(letter);

                if (flag === undefined) {
                    note("unknownFlag", "dropped", `-${letter}`);
                    letterAt += 1;
                    continue;
                }

                if (flag.arity === "none") {
                    applyLongFlag(flag.long, null, false);
                    letterAt += 1;
                    continue;
                }

                const inline = token.slice(letterAt + 1);

                if (inline.length > 0) {
                    applyLongFlag(flag.long, inline, false);
                } else {
                    const value = tokens[index + 1];

                    if (value === undefined) {
                        return { ok: false, reason: "missing_value", token };
                    }

                    applyLongFlag(flag.long, value, false);
                    consumedNext = true;
                }

                break;
            }

            index += consumedNext ? 2 : 1;
            continue;
        }

        positional.push(token);
        index += 1;
    }

    if (positional.length === 0) {
        return { ok: false, reason: "no_url" };
    }

    const url = ensureScheme(positional[0]);

    /* -------------------------------------------------------------- body --- */

    let body: HttpBody = { kind: "none" };
    const fileChunk = dataChunks.find((chunk) => chunk.file !== null);
    const joined = dataChunks
        .filter((chunk) => chunk.file === null)
        .map((chunk) => chunk.text)
        .join("&");

    if (formParts.length > 0) {
        body = { kind: "multipart", parts: formParts };
        headers = defaultHeader(headers, "Content-Type", "multipart/form-data");
    } else if (state.jsonBody !== null) {
        body = { kind: "json", text: state.jsonBody };
        // `--json` is shorthand for these two headers as well as the payload.
        headers = defaultHeader(headers, "Content-Type", JSON_CONTENT_TYPE);
        headers = defaultHeader(headers, "Accept", JSON_CONTENT_TYPE);
    } else if (state.uploadFile !== null) {
        body = { kind: "file", path: state.uploadFile, binary: true };
    } else if (fileChunk !== undefined && joined.length === 0) {
        body = { kind: "file", path: fileChunk.file ?? "", binary: fileChunk.binary };
    } else if (joined.length > 0) {
        const contentType = headers.find(
            (header) => header.name.toLowerCase() === "content-type",
        )?.value;

        if (contentType !== undefined && contentType.toLowerCase().includes("json")) {
            body = { kind: "json", text: joined };
        } else if (
            contentType === undefined ||
            contentType.toLowerCase().includes("x-www-form-urlencoded")
        ) {
            const fields = parseUrlEncodedBody(joined);

            body = fields === null ? { kind: "raw", text: joined } : { kind: "urlencoded", fields };
        } else {
            body = { kind: "raw", text: joined };
        }

        // curl sends this whenever `-d` is used and nothing else was asked for.
        // Making it explicit is the difference between a `fetch` that behaves
        // like the command and one that quietly sends `text/plain`.
        headers = defaultHeader(headers, "Content-Type", FORM_CONTENT_TYPE);
    }

    /* ------------------------------------------------------------- query --- */

    let finalUrl = url;

    if (state.asGet && joined.length > 0) {
        finalUrl = appendQuery(url, joined);
        body = { kind: "none" };
        headers = removeHeader(headers, "Content-Type");
        note("getWithBody", "adapted");
    }

    /* -------------------------------------------------------------- auth --- */

    let auth: HttpAuth | null = null;

    if (state.bearerToken !== null) {
        auth = { scheme: "bearer", user: "", password: "", token: state.bearerToken };
    } else if (state.authUser !== null) {
        const colon = state.authUser.indexOf(":");

        auth = {
            scheme: state.authScheme,
            user: colon === -1 ? state.authUser : state.authUser.slice(0, colon),
            password: colon === -1 ? "" : state.authUser.slice(colon + 1),
            token: "",
        };
    }

    /* ------------------------------------------------------------ method --- */

    const method =
        state.explicitMethod ??
        (transfer.headOnly
            ? "HEAD"
            : state.asGet || body.kind === "none"
              ? "GET"
              : state.uploadFile !== null
                ? "PUT"
                : "POST");

    // A command may write its cookies either way; both land in one list, so the
    // Request tab reads the same however they arrived. Header-declared pairs
    // lead only because they are the ones that were spelled out in full — curl
    // merges the two sets and the order it sends them in carries no meaning.
    const split = splitCookies(headers);

    return {
        ok: true,
        shell,
        notes,
        request: {
            method,
            url: finalUrl,
            query: queryOf(finalUrl),
            headers: split.headers,
            cookies: [...split.cookies, ...cookies],
            auth,
            body,
            transfer,
        },
    };
}
