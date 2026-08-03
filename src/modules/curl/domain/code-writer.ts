import { INDENT_SPACES } from "./constants";
import type { HttpHeader, IndentWidth, KeyValue } from "../types";

/**
 * Writing JavaScript, rather than templating it. Every value a request carries
 * came from somewhere else — a header a server chose, a payload a person typed
 * — so nothing here may be pasted into the output unescaped.
 */

const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeInto(value: string, quote: '"' | "'"): string {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll(quote, `\\${quote}`)
        .replaceAll("\r", "\\r")
        .replaceAll("\n", "\\n")
        .replaceAll("\t", "\\t");
}

/**
 * A literal for the value. A payload spanning several lines becomes a template
 * literal, because a 40-line JSON body written as one `\n`-riddled string is
 * unreadable and unusable — but then `` ` `` and `${` have to be escaped, or
 * the snippet stops being the request it came from.
 */
export function jsString(value: string): string {
    if (value.includes("\n")) {
        const escaped = value
            .replaceAll("\\", "\\\\")
            .replaceAll("`", "\\`")
            .replaceAll("${", "\\${");

        return `\`${escaped}\``;
    }

    const quote = value.includes('"') && !value.includes("'") ? "'" : '"';

    return `${quote}${escapeInto(value, quote)}${quote}`;
}

export function jsKey(name: string): string {
    return BARE_KEY.test(name) ? name : jsString(name);
}

export class CodeWriter {
    private readonly unit: string;

    constructor(indent: IndentWidth) {
        this.unit = INDENT_SPACES[indent];
    }

    indent(level: number): string {
        return this.unit.repeat(level);
    }

    /** `{ a: 1, b: 2 }` over as many lines as it has entries. */
    object(entries: readonly (readonly [string, string])[], level: number): string {
        if (entries.length === 0) {
            return "{}";
        }

        const inner = entries
            .map(([key, value]) => `${this.indent(level + 1)}${jsKey(key)}: ${value},`)
            .join("\n");

        return `{\n${inner}\n${this.indent(level)}}`;
    }

    headers(headers: readonly HttpHeader[], level: number): string {
        return this.object(
            headers.map((header) => [header.name, jsString(header.value)] as const),
            level,
        );
    }

    pairs(fields: readonly KeyValue[], level: number): string {
        return this.object(
            fields.map((field) => [field.key, jsString(field.value)] as const),
            level,
        );
    }

    /**
     * A JSON payload re-written as a JavaScript object literal, so the snippet
     * shows the shape rather than one long escaped string. Returns null when
     * the text is not JSON, and the caller falls back to the literal it has.
     */
    jsonLiteral(text: string, level: number): string | null {
        let parsed: unknown;

        try {
            parsed = JSON.parse(text);
        } catch {
            return null;
        }

        if (parsed === null || typeof parsed !== "object") {
            return null;
        }

        return this.value(parsed, level);
    }

    private value(input: unknown, level: number): string {
        if (input === null) {
            return "null";
        }

        if (typeof input === "string") {
            return jsString(input);
        }

        if (typeof input === "number" || typeof input === "boolean") {
            return String(input);
        }

        if (Array.isArray(input)) {
            if (input.length === 0) {
                return "[]";
            }

            const inner = input
                .map((item) => `${this.indent(level + 1)}${this.value(item, level + 1)},`)
                .join("\n");

            return `[\n${inner}\n${this.indent(level)}]`;
        }

        if (typeof input === "object") {
            const entries = Object.entries(input as Record<string, unknown>);

            if (entries.length === 0) {
                return "{}";
            }

            const inner = entries
                .map(
                    ([key, item]) =>
                        `${this.indent(level + 1)}${jsKey(key)}: ${this.value(item, level + 1)},`,
                )
                .join("\n");

            return `{\n${inner}\n${this.indent(level)}}`;
        }

        return "null";
    }
}

/** Whether the response is likelier to be JSON than text, for the read call. */
export function expectsJson(headers: readonly HttpHeader[]): boolean {
    const accept = headers.find((header) => header.name.toLowerCase() === "accept")?.value;

    if (accept !== undefined) {
        return accept.toLowerCase().includes("json");
    }

    const contentType = headers.find(
        (header) => header.name.toLowerCase() === "content-type",
    )?.value;

    return contentType === undefined ? true : contentType.toLowerCase().includes("json");
}
