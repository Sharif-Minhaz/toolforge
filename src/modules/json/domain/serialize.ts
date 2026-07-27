import type { JsonMember, JsonNode, JsonSerializeOptions } from "../types";

const ESCAPES: Record<string, string> = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
};

function unicodeEscape(code: number): string {
    return `\\u${code.toString(16).padStart(4, "0")}`;
}

/**
 * Wraps a decoded string back into a JSON literal.
 *
 * `/` is deliberately left alone — escaping it is allowed but never required,
 * and leaving it produces the same output every other formatter does.
 */
export function encodeJsonString(value: string, escapeUnicode: boolean): string {
    let out = '"';

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        const mapped = ESCAPES[char];

        if (mapped !== undefined) {
            out += mapped;
            continue;
        }

        const code = value.charCodeAt(index);

        if (code < 0x20) {
            out += unicodeEscape(code);
            continue;
        }

        if (code >= 0xd800 && code <= 0xdfff) {
            const next = value.charCodeAt(index + 1);
            const paired = code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;

            if (!paired) {
                // A half without its partner has to be escaped, or the output
                // would not survive being read back.
                out += unicodeEscape(code);
                continue;
            }

            out += escapeUnicode
                ? unicodeEscape(code) + unicodeEscape(next)
                : char + value[index + 1];
            index += 1;
            continue;
        }

        out += escapeUnicode && code > 0x7e ? unicodeEscape(code) : char;
    }

    return `${out}"`;
}

/** Code-point order, so a supplementary-plane key sorts after every BMP one. */
function compareKeys(left: string, right: string): number {
    const a = Array.from(left);
    const b = Array.from(right);
    const shared = Math.min(a.length, b.length);

    for (let index = 0; index < shared; index += 1) {
        const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0);

        if (difference !== 0) {
            return difference;
        }
    }

    return a.length - b.length;
}

/**
 * Renders a parsed tree back to text. Number literals are written exactly as
 * they were read, so reformatting a document never changes what it says.
 */
export function serializeJson(root: JsonNode, options: JsonSerializeOptions): string {
    const { indent, sortKeys, escapeUnicode } = options;
    const pretty = indent.length > 0;

    function block(parts: readonly string[], level: number, open: string, close: string): string {
        if (!pretty) {
            return `${open}${parts.join(",")}${close}`;
        }

        const pad = indent.repeat(level + 1);
        const body = parts.map((part) => pad + part).join(",\n");

        return `${open}\n${body}\n${indent.repeat(level)}${close}`;
    }

    function writeMember(member: JsonMember, level: number): string {
        const key = encodeJsonString(member.key, escapeUnicode);

        return `${key}:${pretty ? " " : ""}${write(member.value, level)}`;
    }

    function write(node: JsonNode, level: number): string {
        switch (node.kind) {
            case "null":
                return "null";
            case "boolean":
                return node.value ? "true" : "false";
            case "number":
                return node.raw;
            case "string":
                return encodeJsonString(node.value, escapeUnicode);
            case "array":
                return node.items.length === 0
                    ? "[]"
                    : block(
                          node.items.map((item) => write(item, level + 1)),
                          level,
                          "[",
                          "]",
                      );
            case "object": {
                if (node.members.length === 0) {
                    return "{}";
                }

                const members = sortKeys
                    ? node.members.toSorted((a, b) => compareKeys(a.key, b.key))
                    : node.members;

                return block(
                    members.map((member) => writeMember(member, level + 1)),
                    level,
                    "{",
                    "}",
                );
            }
        }
    }

    return write(root, 0);
}
