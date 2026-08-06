import type { JsonValue } from "../types/graph";
import { baseType, isJsonType } from "./content-type";

/**
 * Turning a request body into something a value tree can read fields out of.
 *
 * `From the request → Body → email` is one of the first things anybody reaches
 * for, and until now it worked only for JSON. A form post — the single most
 * common thing there is to mock, since it is what a browser sends when somebody
 * presses a button — arrived as the raw string `email=a%40b.com&remember=on`,
 * and reading `email` off a string is `undefined`. The condition did not fail;
 * it quietly matched nothing, which is worse.
 *
 * Three shapes are parsed and everything else is kept as text:
 *
 * - **JSON**, including `+json` suffixes.
 * - **`application/x-www-form-urlencoded`**, what a plain `<form>` posts.
 * - **`multipart/form-data`**, what a form with a file input posts.
 *
 * **A repeated field is an array, not the last one wins.** `tag=a&tag=b` is two
 * tags, and a parser that answers `"b"` has thrown away half the request — which
 * is exactly the thing a mock is being used to inspect.
 *
 * **A file part is described, never carried.** A five-megabyte upload has no
 * business inside a condition. What a mock wants to branch on is the name, the
 * type and the size, so that is what a file becomes — and the size has to be
 * *right*, because "is this under a megabyte" is the whole question.
 *
 * **A multipart body arrives byte-per-character, and that is a contract.** The
 * route handler reads it with `arrayBuffer()` and decodes it as latin1, where
 * every byte maps to exactly one character and back again. `request.text()`
 * would have been the obvious call and is wrong here: it decodes as UTF-8, and
 * a JPEG is not UTF-8, so every invalid sequence in it collapses to U+FFFD.
 * Counting *that* gives a size with no relationship to the file — which is
 * precisely the number somebody is branching on. Latin1 costs nothing, keeps the
 * boundary and the headers readable because both are ASCII, and makes
 * `content.length` the byte count exactly. Text fields are decoded back to UTF-8
 * one part at a time, which is the only place the difference matters.
 */

/** What a `multipart/form-data` file part becomes. */
export type UploadedFile = {
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
};

/**
 * The same keys as a runtime list, so the path picker can offer them.
 *
 * Derived from the type in both directions: a `Record<keyof UploadedFile, true>`
 * fails to compile when a property is added *and* when one is removed, which a
 * hand-written array with a `satisfies` clause only half does. The picker
 * suggesting a property an upload no longer has is exactly the kind of drift
 * nothing else would catch — a wrong path resolves to `null` at run time and
 * looks like a request that did not carry the file.
 */
const UPLOAD_FILE_SHAPE: Record<keyof UploadedFile, true> = {
    filename: true,
    contentType: true,
    size: true,
};

export const UPLOAD_FILE_KEYS = Object.keys(UPLOAD_FILE_SHAPE) as readonly (keyof UploadedFile)[];

export function isFormType(value: string): boolean {
    return baseType(value) === "application/x-www-form-urlencoded";
}

export function isMultipartType(value: string): boolean {
    return baseType(value) === "multipart/form-data";
}

export function parseRequestBody(rawBody: string, contentType: string): JsonValue {
    if (rawBody === "") {
        return null;
    }

    if (isJsonType(contentType)) {
        try {
            return JSON.parse(rawBody) as JsonValue;
        } catch {
            // A body that claims to be JSON and is not degrades to its text
            // rather than failing the request: the graph decides what it cares
            // about, and refusing here answers a question nobody asked.
            return rawBody;
        }
    }

    if (isFormType(contentType)) {
        return parseUrlEncoded(rawBody);
    }

    if (isMultipartType(contentType)) {
        const boundary = readBoundary(contentType);

        return boundary === null ? rawBody : parseMultipart(rawBody, boundary);
    }

    return rawBody;
}

/**
 * `a=1&b=2&tag=x&tag=y` → `{ a: "1", b: "2", tag: ["x", "y"] }`.
 *
 * `URLSearchParams` rather than a hand-rolled split, because `+` means a space
 * here and `%2B` means a plus, and that is the pair everybody gets wrong.
 */
function parseUrlEncoded(rawBody: string): JsonValue {
    return collect(new URLSearchParams(rawBody).entries());
}

/** The `boundary=` parameter, unquoted. Absent means the body is unreadable. */
function readBoundary(contentType: string): string | null {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType);
    const found = (match?.[1] ?? match?.[2] ?? "").trim();

    return found === "" ? null : found;
}

/**
 * A multipart body, split on its own boundary.
 *
 * Hand-written rather than taken from a dependency, and the reason is the same
 * one the signature table in the Domain Inspector gives: every multipart parser
 * on npm expects a Node stream and brings a file-writing layer with it, and none
 * of that applies to a string that has already been read. What is here is the
 * part of RFC 7578 a form actually uses.
 */
function parseMultipart(rawBody: string, boundary: string): JsonValue {
    const parts = rawBody.split(`--${boundary}`);
    const entries: [string, JsonValue][] = [];

    for (const part of parts) {
        // The preamble, the epilogue and the closing `--` are not parts.
        if (part === "" || part === "--" || part.trim() === "--") {
            continue;
        }

        // Headers and content are separated by a blank line. CRLF per the RFC,
        // but a hand-rolled client sending bare LF should still be readable.
        const split = /\r?\n\r?\n/u.exec(part);

        if (split === null) {
            continue;
        }

        const headers = part.slice(0, split.index);
        // A part's content ends with the CRLF that precedes the next boundary,
        // and that CRLF belongs to the delimiter rather than to the value.
        const content = part.slice(split.index + split[0].length).replace(/\r?\n$/u, "");

        const disposition = /name=(?:"([^"]*)"|([^;\r\n]+))/iu.exec(headers);
        const name = (disposition?.[1] ?? disposition?.[2] ?? "").trim();

        if (name === "") {
            continue;
        }

        const filename = /filename=(?:"([^"]*)"|([^;\r\n]+))/iu.exec(headers);

        if (filename === null) {
            // A text field, and the one place the latin1 contract has to be
            // undone: `naïve` arrived as two characters and has to go back to
            // one before anything reads it.
            entries.push([name, utf8(content)]);
            continue;
        }

        const partType = /content-type:\s*([^\r\n;]+)/iu.exec(headers);

        entries.push([
            name,
            {
                filename: utf8((filename[1] ?? filename[2] ?? "").trim()),
                contentType: (partType?.[1] ?? "application/octet-stream").trim(),
                // One character is one byte, so this *is* the byte count. See
                // the note at the top for why the alternative is not.
                size: content.length,
            } satisfies UploadedFile,
        ]);
    }

    return collect(entries);
}

/**
 * A latin1 slice read back as the UTF-8 it really was.
 *
 * `TextDecoder` rather than `Buffer`, so `domain/` stays framework-free — and
 * non-strict, so a field that is not valid UTF-8 comes back as replacement
 * characters instead of throwing a request away.
 */
function utf8(latin1: string): string {
    const bytes = Uint8Array.from(latin1, (character) => character.charCodeAt(0) & 0xff);

    return new TextDecoder().decode(bytes);
}

/** Repeated names become an array, in the order they arrived. */
function collect(entries: Iterable<[string, JsonValue]>): JsonValue {
    const out: Record<string, JsonValue> = {};

    for (const [name, value] of entries) {
        const held = out[name];

        if (held === undefined) {
            out[name] = value;
        } else if (Array.isArray(held)) {
            out[name] = [...held, value];
        } else {
            out[name] = [held, value];
        }
    }

    return out;
}
