import { parseJson } from "@/modules/tools/domain/json-parser";
import { serializeJson } from "@/modules/tools/domain/json-serialize";

/**
 * Beautifying the text in the editor, over the same reader and writer the JSON
 * Formatter uses.
 *
 * Five lines rather than a call into `modules/json`, because a tool may not
 * import another tool's module — and once `parser.ts` and `serialize.ts` moved
 * to `tools/domain/`, the only thing left in the formatter's own `formatJson`
 * was its options: modes, indent presets, the published grammar to hold a
 * document to, the statistics it reports. None of that applies here, where there
 * is exactly one right answer — two spaces, key order kept, nothing escaped.
 *
 * The reason this is not `JSON.stringify(JSON.parse(text), null, 2)` is the same
 * reason the formatter is not: **`JSON.parse` routes every number through a
 * double**, so a nineteen-digit id silently rounds. This keeps every literal
 * exactly as it was written, which matters most in precisely the file people
 * paste real ids into.
 *
 * Repair is off. This document is going to be served to other programs, and a
 * comma the studio silently inserted is a difference between what somebody
 * pasted and what their client receives.
 */
export function formatDocumentText(text: string): string | null {
    const parsed = parseJson(text, false);

    if (!parsed.ok) {
        return null;
    }

    return serializeJson(parsed.root, {
        indent: "  ",
        sortKeys: false,
        escapeUnicode: false,
    });
}
