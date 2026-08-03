import type {
    ConversionNote,
    CurlFailure,
    HttpBody,
    HttpHeader,
    HttpRequest,
    KeyValue,
    MultipartPart,
    TransferOptions,
} from "../types";
import { EMPTY_TRANSFER, FORM_CONTENT_TYPE, MAX_CURL_INPUT_LENGTH } from "./constants";
import { splitCookies } from "./headers";
import {
    asNumber,
    asString,
    entryOf,
    resolve,
    scanSource,
    type JsValue,
    type ScannedSource,
} from "./js-value";
import { ensureScheme, parseUrlEncodedBody, queryOf } from "./url";

export type FetchParseResult =
    | {
          readonly ok: true;
          readonly request: HttpRequest;
          readonly notes: readonly ConversionNote[];
      }
    | CurlFailure;

const UNSUPPORTED = Symbol("unsupported");

/** What `fetch` puts on a string body when the init names no type of its own. */
const TEXT_CONTENT_TYPE = "text/plain;charset=UTF-8";

function looksLikeJson(text: string): boolean {
    const trimmed = text.trim();

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return false;
    }

    try {
        JSON.parse(trimmed);

        return true;
    } catch {
        return false;
    }
}

function lastSegment(path: string): string {
    const segments = path.split(".");

    return segments[segments.length - 1];
}

function toPlain(value: JsValue): unknown {
    switch (value.kind) {
        case "string":
            return value.value;
        case "number":
            return value.value;
        case "boolean":
            return value.value;
        case "null":
            return null;
        case "array": {
            const items = value.items.map(toPlain);

            return items.includes(UNSUPPORTED) ? UNSUPPORTED : items;
        }
        case "object": {
            const out: Record<string, unknown> = {};

            for (const entry of value.entries) {
                if (entry.key.length === 0) {
                    return UNSUPPORTED;
                }

                const plain = toPlain(entry.value);

                if (plain === UNSUPPORTED) {
                    return UNSUPPORTED;
                }

                out[entry.key] = plain;
            }

            return out;
        }
        default:
            return UNSUPPORTED;
    }
}

/** The object handed to `JSON.stringify`, as the text that call would produce. */
function jsonTextOf(value: JsValue): string | null {
    const plain = toPlain(value);

    return plain === UNSUPPORTED ? null : JSON.stringify(plain);
}

/* ------------------------------------------------------------- headers --- */

function pairsFromArray(value: JsValue): readonly HttpHeader[] {
    if (value.kind !== "array") {
        return [];
    }

    return value.items.flatMap((item) => {
        if (item.kind !== "array" || item.items.length < 2) {
            return [];
        }

        const name = asString(item.items[0]);
        const headerValue = asString(item.items[1]);

        return name === null || headerValue === null ? [] : [{ name, value: headerValue }];
    });
}

function readHeaders(value: JsValue | null, scan: ScannedSource): readonly HttpHeader[] {
    const resolved = resolve(value, scan.declarations);

    if (resolved === null) {
        return [];
    }

    if (resolved.kind === "object") {
        return resolved.entries.flatMap((entry) => {
            const text = asString(entry.value);

            return entry.key.length === 0 || text === null
                ? []
                : [{ name: entry.key, value: text }];
        });
    }

    if (resolved.kind === "array") {
        return pairsFromArray(resolved);
    }

    // `new Headers(…)` wraps either shape, and adds nothing this cares about.
    if (resolved.kind === "call" && lastSegment(resolved.callee) === "Headers") {
        return resolved.args.length === 0 ? [] : readHeaders(resolved.args[0], scan);
    }

    return [];
}

/** `headers.set("Accept", "…")` written after the object was built. */
function headersFromCalls(name: string, scan: ScannedSource): readonly HttpHeader[] {
    return scan.calls.flatMap((call) => {
        const [receiver, method] = call.callee.split(".");

        if (receiver !== name || (method !== "set" && method !== "append")) {
            return [];
        }

        const headerName = asString(call.args[0] ?? null);
        const headerValue = asString(call.args[1] ?? null);

        return headerName === null || headerValue === null
            ? []
            : [{ name: headerName, value: headerValue }];
    });
}

/* ---------------------------------------------------------------- body --- */

function fieldsFromValue(value: JsValue): readonly KeyValue[] {
    if (value.kind === "object") {
        return value.entries.flatMap((entry) => {
            const text = asString(entry.value);

            return entry.key.length === 0 || text === null ? [] : [{ key: entry.key, value: text }];
        });
    }

    if (value.kind === "array") {
        return pairsFromArray(value).map((header) => ({ key: header.name, value: header.value }));
    }

    if (value.kind === "string") {
        return parseUrlEncodedBody(value.value) ?? [];
    }

    return [];
}

function partsFromAppends(name: string, scan: ScannedSource): readonly MultipartPart[] {
    return scan.calls.flatMap((call): MultipartPart[] => {
        const [receiver, method] = call.callee.split(".");

        if (receiver !== name || method !== "append") {
            return [];
        }

        const field = asString(call.args[0] ?? null);

        if (field === null) {
            return [];
        }

        const value = call.args[1];
        const filename = asString(call.args[2] ?? null);
        const literal = value === undefined ? null : asString(value);

        if (literal !== null && filename === null) {
            return [{ name: field, value: literal, filename: null, contentType: null }];
        }

        // A Blob, a File, or a variable — whatever it is, it is a file part,
        // and the expression that produced it is the best label available.
        const source =
            value === undefined
                ? ""
                : (literal ??
                  (value.kind === "identifier"
                      ? value.name
                      : value.kind === "raw"
                        ? value.text
                        : ""));

        return [
            {
                name: field,
                value: filename ?? source,
                filename: filename ?? source,
                contentType: null,
            },
        ];
    });
}

/* ------------------------------------------------------------ dispatcher --- */

function readDispatcher(value: JsValue | null, transfer: TransferOptions): TransferOptions {
    if (value === null || value.kind !== "call") {
        return transfer;
    }

    const callee = lastSegment(value.callee);

    if (callee === "ProxyAgent") {
        const uri =
            asString(value.args[0] ?? null) ?? asString(entryOf(value.args[0] ?? null, "uri"));

        return uri === null ? transfer : { ...transfer, proxy: uri };
    }

    if (callee === "Agent" || callee === "https.Agent") {
        const options = value.args[0] ?? null;
        const connect = entryOf(options, "connect");
        const reject =
            entryOf(connect, "rejectUnauthorized") ?? entryOf(options, "rejectUnauthorized");

        return reject !== null && reject.kind === "boolean" && !reject.value
            ? { ...transfer, insecure: true }
            : transfer;
    }

    return transfer;
}

/* --------------------------------------------------------------- public --- */

/**
 * Reads a `fetch` snippet into the request it describes.
 *
 * The important asymmetry with `parseCurl`: a `fetch` that says nothing about
 * redirects *follows* them, while a curl that says nothing does not. Carrying
 * the default across rather than the absence is what makes `-L` appear in the
 * command, and leaving it out would silently change the request.
 */
export function parseFetch(input: string): FetchParseResult {
    const text = input.trim();

    if (text.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (text.length > MAX_CURL_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const scan = scanSource(text);
    const call = scan.calls.find((entry) => lastSegment(entry.callee) === "fetch");

    if (call === undefined) {
        return { ok: false, reason: "no_request_call" };
    }

    const notes: ConversionNote[] = [];
    const target = resolve(call.args[0] ?? null, scan.declarations);

    if (target === null) {
        return { ok: false, reason: "no_url" };
    }

    let url = asString(target);

    if (url === null && target.kind === "call" && lastSegment(target.callee) === "URL") {
        const relative = asString(target.args[0] ?? null);
        const base = asString(target.args[1] ?? null);

        if (relative !== null) {
            try {
                url = base === null ? relative : new URL(relative, base).href;
            } catch {
                url = relative;
            }
        }
    }

    if (url === null) {
        return {
            ok: false,
            reason: "unsupported_expression",
            token: target.kind === "raw" ? target.text : undefined,
        };
    }

    const init = resolve(call.args[1] ?? null, scan.declarations);

    /* ----------------------------------------------------------- headers --- */

    const headersValue = entryOf(init, "headers");
    let headers: readonly HttpHeader[] = readHeaders(headersValue, scan);

    if (headersValue !== null && headersValue.kind === "identifier") {
        headers = [...headers, ...headersFromCalls(headersValue.name, scan)];
    }

    /* -------------------------------------------------------------- body --- */

    const bodyValue = resolve(entryOf(init, "body"), scan.declarations);
    const rawBody = entryOf(init, "body");
    let body: HttpBody = { kind: "none" };

    if (bodyValue !== null && bodyValue.kind !== "null" && bodyValue.kind !== "undefined") {
        // The payload is read first and classified second, because what it *is*
        // depends on the Content-Type — and `fetch` supplies one when the init
        // does not. A string body, `JSON.stringify` included, goes out as
        // `text/plain;charset=UTF-8`: the single most common reason a request
        // that works in curl is rejected when it is rewritten as `fetch`.
        let payload: string | null = null;
        let implied: string | null = null;

        if (bodyValue.kind === "call" && lastSegment(bodyValue.callee) === "stringify") {
            payload = jsonTextOf(bodyValue.args[0] ?? { kind: "raw", text: "" });
            implied = TEXT_CONTENT_TYPE;

            if (payload === null) {
                notes.push({
                    id: "templatePlaceholder",
                    kind: "dropped",
                    detail: "JSON.stringify",
                });
                payload = "";
            }
        } else if (bodyValue.kind === "string") {
            payload = bodyValue.value;
            implied = TEXT_CONTENT_TYPE;
        } else if (
            bodyValue.kind === "call" &&
            lastSegment(bodyValue.callee) === "URLSearchParams"
        ) {
            body = {
                kind: "urlencoded",
                fields: bodyValue.args.length === 0 ? [] : fieldsFromValue(bodyValue.args[0]),
            };
            implied = `${FORM_CONTENT_TYPE};charset=UTF-8`;
        } else if (bodyValue.kind === "call" && lastSegment(bodyValue.callee) === "FormData") {
            const name = rawBody !== null && rawBody.kind === "identifier" ? rawBody.name : null;

            // No implied header: the boundary is chosen when the body is sent.
            body = { kind: "multipart", parts: name === null ? [] : partsFromAppends(name, scan) };
        } else {
            const label = bodyValue.kind === "raw" ? bodyValue.text : "";

            body = { kind: "file", path: label, binary: true };
            notes.push({ id: "templatePlaceholder", kind: "dropped", detail: label });
        }

        const declared = headers.find((header) => header.name.toLowerCase() === "content-type");

        if (declared === undefined && implied !== null) {
            headers = [...headers, { name: "Content-Type", value: implied }];
        }

        const contentType = (declared?.value ?? implied ?? "").toLowerCase();

        if (payload !== null) {
            const fields = parseUrlEncodedBody(payload);

            if (contentType.includes("json")) {
                body = { kind: "json", text: payload };
            } else if (fields !== null && contentType.includes("form-urlencoded")) {
                body = { kind: "urlencoded", fields };
            } else {
                body = { kind: "raw", text: payload };
            }

            // Worth saying out loud only when the two disagree: a payload that
            // is plainly JSON, going out under a header that does not say so.
            if (declared === undefined && !contentType.includes("json") && looksLikeJson(payload)) {
                notes.push({
                    id: "implicitContentType",
                    kind: "adapted",
                    detail: implied ?? TEXT_CONTENT_TYPE,
                });
            }
        }
    }

    /* ---------------------------------------------------------- transfer --- */

    const redirect = asString(entryOf(init, "redirect"));
    const signal = entryOf(init, "signal");
    const timeoutMs =
        signal !== null && signal.kind === "call" && lastSegment(signal.callee) === "timeout"
            ? asNumber(signal.args[0] ?? null)
            : null;

    let transfer: TransferOptions = {
        ...EMPTY_TRANSFER,
        // fetch follows redirects unless told otherwise; curl does the reverse.
        followRedirects: redirect === null ? true : redirect === "follow",
        maxTimeSeconds: timeoutMs === null ? null : timeoutMs / 1000,
        credentials: asString(entryOf(init, "credentials")),
        mode: asString(entryOf(init, "mode")),
        cache: asString(entryOf(init, "cache")),
        integrity: asString(entryOf(init, "integrity")),
        keepalive: entryOf(init, "keepalive")?.kind === "boolean",
    };

    transfer = readDispatcher(
        resolve(
            entryOf(init, "dispatcher") ?? entryOf(init, "agent") ?? entryOf(init, "httpsAgent"),
            scan.declarations,
        ),
        transfer,
    );

    const referrer = asString(entryOf(init, "referrer"));

    if (referrer !== null && referrer.length > 0) {
        headers = [...headers, { name: "Referer", value: referrer }];
    }

    /* ------------------------------------------------------------ method --- */

    const method = asString(entryOf(init, "method")) ?? (body.kind === "none" ? "GET" : "POST");
    const split = splitCookies(headers);
    const finalUrl = ensureScheme(url);

    return {
        ok: true,
        notes,
        request: {
            method,
            url: finalUrl,
            query: queryOf(finalUrl),
            headers: split.headers,
            cookies: split.cookies,
            auth: null,
            body,
            transfer,
        },
    };
}
