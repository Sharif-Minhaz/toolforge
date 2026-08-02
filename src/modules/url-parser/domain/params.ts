import type { UrlQueryParam } from "../types";

/**
 * A pair with neither a key nor a value is the table's blank row, not a
 * parameter — it is what the reader types into to add one. Keeping `k=` and
 * `=v` matters: both are real query strings, and both survive a round trip
 * through the parser.
 */
function isBlank(param: UrlQueryParam): boolean {
    return param.key.length === 0 && param.value.length === 0;
}

/** `a=1&b=2`, percent-encoded, with no leading `?`. Empty when nothing is set. */
export function buildQueryString(params: readonly UrlQueryParam[]): string {
    const search = new URLSearchParams();

    for (const param of params) {
        if (!isBlank(param)) {
            search.append(param.key, param.value);
        }
    }

    return search.toString();
}

/**
 * Edits one row, appending when `index` points past the end — that is the
 * blank row, so typing into it adds a parameter instead of doing nothing.
 * Out-of-range indexes below zero are left alone rather than throwing; the
 * table is a convenience, and no keystroke should be able to break it.
 */
export function editParam(
    params: readonly UrlQueryParam[],
    index: number,
    patch: Partial<UrlQueryParam>,
): readonly UrlQueryParam[] {
    if (index < 0 || index > params.length) {
        return params;
    }

    const current = params[index] ?? { key: "", value: "" };
    const updated = { ...current, ...patch };

    return index === params.length
        ? [...params, updated]
        : params.map((param, at) => (at === index ? updated : param));
}

export function removeParam(
    params: readonly UrlQueryParam[],
    index: number,
): readonly UrlQueryParam[] {
    return params.filter((_, at) => at !== index);
}

/**
 * Rebuilds `href` with a different query string, leaving every other part —
 * credentials, port, path, fragment — exactly as it was. A href that cannot be
 * parsed comes back unchanged; the caller only ever holds one that already did.
 */
export function applyParams(href: string, params: readonly UrlQueryParam[]): string {
    let url: URL;

    try {
        url = new URL(href);
    } catch {
        return href;
    }

    url.search = buildQueryString(params);

    return url.href;
}
