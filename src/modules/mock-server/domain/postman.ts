import { MAX_ENDPOINTS_PER_SERVER, MAX_NODE_VALUE_LENGTH, MAX_PATH_SEGMENTS } from "./constants";
import { baseType, DEFAULT_CONTENT_TYPE, isJsonType } from "./content-type";
import {
    buildImportGraph,
    toRequiredFields,
    type ImportedDocument,
    type ImportedEndpoint,
    type ReadImportOptions,
} from "./import";
import { parsePathPattern } from "./path-pattern";
import {
    HTTP_METHODS,
    type DeclaredField,
    type DeclaredRequestShape,
    type HttpMethod,
    type JsonValue,
    type RequestSource,
} from "../types/graph";

/**
 * Turning a Postman collection into endpoints.
 *
 * Pure and dependency-free, like `openapi.ts`, and it reads the same
 * `ImportedDocument` out the other end — the difference between the two files is
 * only what each notation makes knowable.
 *
 * And they make very different things knowable, which is the thing to hold on
 * to here. **An OpenAPI operation is a contract; a Postman request is a call
 * somebody made.** One says what a caller *must* send, the other shows what one
 * *did* send. So every mapping below is a reading of a sample, and the readings
 * worth arguing about are these:
 *
 * **The saved response is the answer, and there is usually none.** A collection
 * carries `item.response[]` only where somebody pressed Send and saved the
 * result, and most exported collections carry none at all. Where there is one it
 * is better than anything a schema could generate, because it is the real
 * server's own bytes. Where there is not, the route answers the same placeholder
 * a hand-built one does — and `fromExample` records which, so the panel can say
 * so rather than let twelve identical placeholder routes read as twelve
 * imported responses.
 *
 * **A header the request carries is a header the API wanted.** Nobody puts
 * `channelId` on a saved request for fun. That makes enforcing it a defensible
 * bet and not a certain one, which is exactly what the enforce switch is for —
 * and it is why the transport headers Postman writes by itself (`Postman-Token`,
 * `User-Agent`, `Content-Length`…) are dropped rather than guarded: those say
 * something about the client, not about the API.
 *
 * **A `{{variable}}` in a path is a parameter, not its value.** A collection
 * variable `userId` may well hold `42`, but a mock route baked to `/users/42`
 * answers one call and 404s the rest, while `/users/:userId` answers all of
 * them. Only the leading `{{baseUrl}}` is resolved away, because that one is an
 * address rather than a path, and the address is this studio's to choose.
 */

/** Deep enough for any collection's folders, shallow enough to terminate. */
const MAX_FOLDER_DEPTH = 8;

/**
 * Headers a client writes for itself, which say nothing about the API.
 *
 * Guarding one of these would produce a route that refuses every request made
 * by anything other than Postman — `Postman-Token` is the clearest case, and
 * `Content-Length` is a header `fetch` sets and nobody sends by hand.
 */
const CLIENT_HEADERS = new Set([
    "accept-encoding",
    "cache-control",
    "connection",
    "content-length",
    "host",
    "postman-token",
    "user-agent",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

/** A `{{name}}` this router can hold: `:name`, with the rest spelled out. */
function toRouteParameter(name: string): string {
    return `:${name.trim().replace(/[^A-Za-z0-9_]/gu, "_")}`;
}

/**
 * A scheme and authority at the front of a raw URL, in any of the spellings a
 * collection writes it: a literal host, a `{{baseUrl}}`, an IPv6 bracket, a
 * bare `localhost:8000`.
 *
 * Anchored and required to be followed by a `/` or the end, so a relative
 * `programs/list` keeps its first segment rather than having it eaten as a host.
 */
const AUTHORITY =
    /^(?:\{\{[^{}]*\}\}|localhost|\[[^\]]+\]|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?=\/|$)/u;

const SCHEME = /^(?:\{\{[^{}]*\}\}|[A-Za-z][A-Za-z0-9+.-]*):\/\//u;

/**
 * The path out of a raw URL string.
 *
 * Everything before the path is dropped: the address a mock answers on is this
 * studio's, and a collection pointed at `localhost:8000` is describing where the
 * real server was, not where this one will be.
 */
export function pathFromRawUrl(raw: string): string {
    const withoutQuery = raw.split("#")[0].split("?")[0].trim();
    const withoutScheme = withoutQuery.replace(SCHEME, "");
    const withoutAuthority = withoutScheme.replace(AUTHORITY, "");

    if (withoutAuthority === "" || withoutAuthority === "/") {
        return "/";
    }

    return withoutAuthority.startsWith("/") ? withoutAuthority : `/${withoutAuthority}`;
}

/**
 * A request's path, in this router's spelling.
 *
 * The `path` array is preferred over `raw` wherever the export wrote one, which
 * is nearly always: it is already split the way this router splits, so a
 * segment containing an encoded separator survives instead of being re-split.
 */
export function readPostmanPath(url: unknown): string | null {
    if (typeof url === "string") {
        return toRoutePath(pathFromRawUrl(url));
    }

    if (!isRecord(url)) {
        return null;
    }

    if (Array.isArray(url.path)) {
        const segments = url.path
            .map((segment) => (isRecord(segment) ? asString(segment.value) : asString(segment)))
            .filter((segment) => segment !== "");

        return toRoutePath(`/${segments.join("/")}`);
    }

    return typeof url.raw === "string" ? toRoutePath(pathFromRawUrl(url.raw)) : null;
}

/** `{{userId}}` → `:userId`. A path variable is already `:userId` and passes. */
function toRoutePath(path: string): string {
    return path.replace(/\{\{([^{}]*)\}\}/gu, (_match, name: string) => toRouteParameter(name));
}

type KeyedValue = {
    readonly key: string;
    readonly value: JsonValue;
};

/**
 * A Postman key list — headers, query parameters, form fields — as rows.
 *
 * `disabled: true` is the unticked checkbox in the request builder, and it is
 * the author saying "not this one". Reading it as a field the API wants would
 * turn every commented-out header into a guard the real API never asked for.
 */
function readKeyList(list: unknown): readonly KeyedValue[] {
    if (!Array.isArray(list)) {
        return [];
    }

    const rows: KeyedValue[] = [];

    for (const raw of list) {
        if (!isRecord(raw) || raw.disabled === true) {
            continue;
        }

        const key = asString(raw.key).trim();

        if (key === "") {
            continue;
        }

        rows.push({ key, value: typeof raw.value === "string" ? raw.value : null });
    }

    return rows;
}

function declaredFrom(rows: readonly KeyedValue[]): readonly DeclaredField[] {
    // Required, because the request carried it. What that claim is worth is the
    // header question above, and the enforce switch is where it is answered.
    return rows.map((row) => ({ name: row.key, required: true }));
}

type PostmanBody = {
    /** An example of the whole body. `null` when the request carries none. */
    readonly example: JsonValue;
    /** Top-level fields the request sent, as body paths. */
    readonly requiredPaths: readonly string[];
};

const NO_BODY: PostmanBody = { example: null, requiredPaths: [] };

/**
 * A raw body as a value, tolerating the templating that makes it invalid JSON.
 *
 * `{"amount": {{amount}}}` is an ordinary thing to find in a collection and not
 * ordinary JSON. Quoting the bare placeholders is enough to make it parse, and a
 * body that still will not is kept as its own text — which is a truthful example
 * of a request that sends XML, a form, or a template this reader does not know.
 */
export function parseRawBody(raw: string): JsonValue {
    const text = raw.trim();

    if (text === "") {
        return null;
    }

    try {
        return JSON.parse(text) as JsonValue;
    } catch {
        // Only placeholders that are not already inside quotes; `"{{id}}"` is
        // valid JSON as it stands and re-quoting it would break what parsed.
        const quoted = text.replace(/(?<!")\{\{[^{}]*\}\}(?!")/gu, (match) => `"${match}"`);

        try {
            return JSON.parse(quoted) as JsonValue;
        } catch {
            return text.slice(0, MAX_NODE_VALUE_LENGTH);
        }
    }
}

/** What a request's saved body says it carries. */
export function readPostmanBody(request: Record<string, unknown>): PostmanBody {
    const body = request.body;

    if (!isRecord(body)) {
        return NO_BODY;
    }

    if (body.mode === "raw") {
        const example = parseRawBody(asString(body.raw));

        return {
            example,
            requiredPaths: isRecord(example) ? Object.keys(example) : [],
        };
    }

    if (body.mode === "urlencoded" || body.mode === "formdata") {
        const rows = readKeyList(body[body.mode]);

        if (rows.length === 0) {
            return NO_BODY;
        }

        return {
            example: Object.fromEntries(rows.map((row) => [row.key, row.value])),
            requiredPaths: rows.map((row) => row.key),
        };
    }

    if (body.mode === "graphql" && isRecord(body.graphql)) {
        const query = asString(body.graphql.query).slice(0, MAX_NODE_VALUE_LENGTH);

        return {
            example: { query, variables: parseRawBody(asString(body.graphql.variables)) },
            // `variables` is optional in every GraphQL transport; `query` is not.
            requiredPaths: ["query"],
        };
    }

    // `file` — a body this studio has no example of and would not echo anyway.
    return NO_BODY;
}

type SavedResponse = {
    readonly status: number;
    readonly contentType: string;
    readonly example: JsonValue;
};

/**
 * The response a request should mock, out of the ones saved beside it.
 *
 * The lowest 2xx, matching `pickResponse`'s reading of an OpenAPI document, and
 * for the same reason: a caller expects the success case, and picking the first
 * saved example instead would mock a 404 for a request whose author happened to
 * save the failing call first.
 */
export function pickSavedResponse(responses: unknown): SavedResponse | null {
    if (!Array.isArray(responses)) {
        return null;
    }

    const saved = responses
        .filter(isRecord)
        .map((entry) => ({ entry, code: typeof entry.code === "number" ? entry.code : NaN }))
        .filter((row) => Number.isInteger(row.code) && row.code >= 100 && row.code <= 599);

    if (saved.length === 0) {
        return null;
    }

    const success = saved
        .filter((row) => row.code >= 200 && row.code < 300)
        .toSorted((a, b) => a.code - b.code)[0];
    const chosen = success ?? saved[0];
    const declaredType = headerValue(chosen.entry.header, "content-type");
    const body = asString(chosen.entry.body);
    const parsed = declaredType === "" || isJsonType(declaredType) ? tryJson(body) : null;

    return {
        status: chosen.code,
        // What the saved response said it was, when it said anything. A type
        // outside the allowlist collapses at serve time rather than here, so
        // the import stays honest about what the collection held.
        contentType: declaredType === "" ? DEFAULT_CONTENT_TYPE : declaredType,
        // A JSON body becomes a value tree the Response Builder can edit field
        // by field; anything else stays the text the server actually sent.
        example: parsed ?? body.slice(0, MAX_NODE_VALUE_LENGTH),
    };
}

function tryJson(body: string): JsonValue | null {
    if (body.trim() === "") {
        return null;
    }

    try {
        return JSON.parse(body) as JsonValue;
    } catch {
        return null;
    }
}

function headerValue(list: unknown, name: string): string {
    if (!Array.isArray(list)) {
        return "";
    }

    for (const raw of list) {
        if (isRecord(raw) && asString(raw.key).toLowerCase() === name && raw.disabled !== true) {
            return baseType(asString(raw.value));
        }
    }

    return "";
}

function guardFields(
    headers: readonly KeyedValue[],
    query: readonly KeyedValue[],
    body: PostmanBody,
) {
    const fields: { source: RequestSource; path: string }[] = [];

    for (const header of headers) {
        fields.push({ source: "header", path: header.key });
    }

    for (const parameter of query) {
        fields.push({ source: "query", path: parameter.key });
    }

    for (const path of body.requiredPaths) {
        fields.push({ source: "body", path });
    }

    return toRequiredFields(fields);
}

function isHttpMethod(value: string): value is HttpMethod {
    return (HTTP_METHODS as readonly string[]).includes(value);
}

/** The `"request": "https://example.com/x"` shorthand v2 still allows. */
function readRequest(item: Record<string, unknown>): Record<string, unknown> | null {
    if (isRecord(item.request)) {
        return item.request;
    }

    return typeof item.request === "string" ? { method: "GET", url: item.request } : null;
}

/**
 * Reads a Postman collection into endpoints.
 *
 * Total, like `readOpenApi`: an item it cannot map lands in `skipped` with a
 * reason and the rest of the collection still imports.
 */
export function readPostman(document: unknown, options: ReadImportOptions = {}): ImportedDocument {
    const enforceRequired = options.enforceRequired ?? true;

    if (!isRecord(document)) {
        return { title: "", endpoints: [], skipped: [{ path: "", reason: "not_a_document" }] };
    }

    const info = isRecord(document.info) ? document.info : {};
    const endpoints: ImportedEndpoint[] = [];
    const skipped: { path: string; reason: string }[] = [];

    function walk(items: unknown, folder: string, depth: number): void {
        if (!Array.isArray(items) || depth > MAX_FOLDER_DEPTH) {
            return;
        }

        for (const item of items) {
            if (!isRecord(item)) {
                skipped.push({ path: folder, reason: "not_an_object" });
                continue;
            }

            const name = asString(item.name);

            if (Array.isArray(item.item)) {
                walk(item.item, name === "" ? folder : name, depth + 1);
                continue;
            }

            // One row per item that did not fit, rather than one row for the
            // limit: the list under the report is what tells a reader their
            // 260-request collection became 200 routes, and a single line
            // saying "limit reached" makes sixty missing routes invisible.
            if (endpoints.length >= MAX_ENDPOINTS_PER_SERVER) {
                skipped.push({ path: name, reason: "endpoint_limit_reached" });
                continue;
            }

            const endpoint = readItem(item, folder, enforceRequired);

            if ("reason" in endpoint) {
                skipped.push({ path: endpoint.path, reason: endpoint.reason });
                continue;
            }

            endpoints.push(endpoint);
        }
    }

    walk(document.item, "", 0);

    return { title: asString(info.name), endpoints, skipped };
}

function readItem(
    item: Record<string, unknown>,
    folder: string,
    enforceRequired: boolean,
): ImportedEndpoint | { readonly path: string; readonly reason: string } {
    const name = asString(item.name);
    const request = readRequest(item);

    if (request === null) {
        return { path: name, reason: "not_a_request" };
    }

    const method = asString(request.method).toUpperCase() || "GET";

    if (!isHttpMethod(method)) {
        // LINK, PURGE, and the rest Postman allows but this router cannot serve.
        return { path: name, reason: "unsupported_method" };
    }

    const raw = readPostmanPath(request.url);

    if (raw === null) {
        return { path: name, reason: "no_url" };
    }

    const pattern = parsePathPattern(raw);

    if (!pattern.ok) {
        return { path: raw, reason: pattern.reason };
    }

    if (pattern.parsed.segmentCount > MAX_PATH_SEGMENTS) {
        return { path: raw, reason: "too_many_segments" };
    }

    const headers = readKeyList(request.header).filter(
        (header) => !CLIENT_HEADERS.has(header.key.toLowerCase()),
    );
    const query = isRecord(request.url) ? readKeyList(request.url.query) : [];
    const body = readPostmanBody(request);
    const declared: DeclaredRequestShape = {
        headers: declaredFrom(headers),
        query: declaredFrom(query),
        body: body.example,
    };
    const required = enforceRequired ? guardFields(headers, query, body) : [];
    const saved = pickSavedResponse(item.response);

    return {
        method,
        path: pattern.parsed.pattern,
        name: name === "" ? `${method} ${pattern.parsed.pattern}` : name,
        summary: isRecord(request.description)
            ? asString(request.description.content)
            : asString(request.description),
        tag: folder,
        status: saved?.status ?? 200,
        contentType: saved?.contentType ?? DEFAULT_CONTENT_TYPE,
        declared,
        required,
        fromExample: saved !== null,
        graph: buildImportGraph({
            status: saved?.status ?? 200,
            contentType: saved?.contentType ?? DEFAULT_CONTENT_TYPE,
            // `undefined`, not `null`: a collection with no saved response is
            // one this reader has no answer for, and the route starts on the
            // placeholder rather than on a literal `null` body.
            example: saved === null ? undefined : saved.example,
            declared,
            required,
        }),
    };
}
