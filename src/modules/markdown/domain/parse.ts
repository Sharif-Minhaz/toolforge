import { Marked, type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";

import type {
    MarkdownAlertKind,
    MarkdownBlock,
    MarkdownDocument,
    MarkdownHeadingDepth,
    MarkdownInline,
    MarkdownListItem,
    MarkdownOutlineEntry,
    MarkdownParseResult,
    MarkdownTableCell,
} from "../types";
import { DIAGRAM_LANGUAGE, MAX_MARKDOWN_LENGTH } from "./constants";
import { decodeHtmlEntities } from "./entities";
import { safeImageSrc, safeLinkHref } from "./safe-url";
import { createSlugger } from "./slug";

/**
 * Markdown becomes typed nodes here, never an HTML string.
 *
 * That is the whole security posture of the tool. The renderer turns these
 * nodes into React elements, so author text is escaped by React on the way out
 * and raw HTML is carried as a `rawHtml` node the preview prints rather than
 * runs. A `?text=` link therefore cannot execute script on this origin, which
 * an `innerHTML` pipeline would have to be talked out of doing.
 */

/* ------------------------------------------------------------------- math --- */

/**
 * `$$…$$` and `$…$` have to be claimed before the inline rules run, or
 * `\frac{a}{b}` loses its braces to escape handling and `x_1…x_2` turns into
 * emphasis. Tokenizer extensions run ahead of the built-ins, which is exactly
 * the hook needed — no renderers, because nothing here emits HTML.
 */
const BLOCK_MATH = /^\$\$((?:[^$]|\$(?!\$))+?)\$\$/;

/** Rejects `$5 and $10`: an opening delimiter cannot be followed by a space,
 *  a closing one cannot be followed by a digit, and neither may span a blank line. */
const INLINE_MATH = /^\$(?!\s)((?:[^$\n]|\\\$)+?)\$(?!\d)/;

const blockMathExtension: TokenizerAndRendererExtension = {
    name: "blockMath",
    level: "inline",
    start(source: string) {
        const index = source.indexOf("$$");

        return index === -1 ? undefined : index;
    },
    tokenizer(source: string) {
        const match = BLOCK_MATH.exec(source);

        return match === null
            ? undefined
            : { type: "blockMath", raw: match[0], text: match[1].trim() };
    },
};

const inlineMathExtension: TokenizerAndRendererExtension = {
    name: "inlineMath",
    level: "inline",
    start(source: string) {
        const index = source.indexOf("$");

        return index === -1 ? undefined : index;
    },
    tokenizer(source: string) {
        const match = INLINE_MATH.exec(source);

        return match === null
            ? undefined
            : { type: "inlineMath", raw: match[0], text: match[1].trim() };
    },
};

/**
 * One isolated instance rather than the module-level `marked` singleton, so the
 * math extensions cannot leak into — or be clobbered by — anything else that
 * imports the library.
 */
const markdown = new Marked(
    { gfm: true, breaks: false },
    { extensions: [blockMathExtension, inlineMathExtension] },
);

/* --------------------------------------------------------------- narrowing --- */

/** Marked types custom tokens as generic records; this is the read back out. */
function readText(token: Token): string {
    return "text" in token && typeof token.text === "string" ? token.text : "";
}

function childTokens(token: Token): readonly Token[] {
    return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
}

function clampDepth(depth: number): MarkdownHeadingDepth {
    const bounded = Math.min(6, Math.max(1, Math.round(depth)));

    // The union has to come from a literal, and a cast would be the only other
    // way to get there.
    switch (bounded) {
        case 1:
            return 1;
        case 2:
            return 2;
        case 3:
            return 3;
        case 4:
            return 4;
        case 5:
            return 5;
        default:
            return 6;
    }
}

/* ----------------------------------------------------------------- inline --- */

function mapInlineTokens(tokens: readonly Token[]): MarkdownInline[] {
    return tokens.flatMap(mapInline);
}

function mapInline(token: Token): MarkdownInline[] {
    switch (token.type) {
        case "text":
            // A `text` token nests further inline tokens only inside list items
            // and table cells; elsewhere it is a leaf.
            return childTokens(token).length > 0
                ? mapInlineTokens(childTokens(token))
                : [{ kind: "text", value: decodeHtmlEntities(readText(token)) }];
        case "escape":
            return [{ kind: "text", value: readText(token) }];
        case "strong":
            return [{ kind: "strong", children: mapInlineTokens(childTokens(token)) }];
        case "em":
            return [{ kind: "emphasis", children: mapInlineTokens(childTokens(token)) }];
        case "del":
            return [{ kind: "strikethrough", children: mapInlineTokens(childTokens(token)) }];
        case "codespan":
            return [{ kind: "code", value: decodeHtmlEntities(readText(token)) }];
        case "br":
            return [{ kind: "break" }];
        case "link": {
            const link = token as Tokens.Link;
            const href = safeLinkHref(link.href ?? "");
            const children = mapInlineTokens(childTokens(token));

            // A refused scheme degrades to the label as plain text, so the
            // reader can see that something was there and what it said.
            return href === null
                ? children
                : [{ kind: "link", href, title: link.title ?? null, children }];
        }
        case "image": {
            const image = token as Tokens.Image;
            const src = safeImageSrc(image.href ?? "");
            const alt = decodeHtmlEntities(image.text ?? "");

            return src === null
                ? [{ kind: "text", value: alt }]
                : [{ kind: "image", src, title: image.title ?? null, alt }];
        }
        case "inlineMath":
            return [{ kind: "math", tex: readText(token), display: false }];
        case "blockMath":
            return [{ kind: "math", tex: readText(token), display: true }];
        case "html":
            return [{ kind: "text", value: token.raw }];
        default:
            return token.raw.length > 0 ? [{ kind: "text", value: token.raw }] : [];
    }
}

/* ------------------------------------------------------------------ table --- */

function mapCells(cells: readonly Tokens.TableCell[], align: Tokens.Table["align"]) {
    return cells.map((cell, index): MarkdownTableCell => ({
        align: align[index] ?? null,
        children: mapInlineTokens(cell.tokens),
    }));
}

/* ------------------------------------------------------------------ alert --- */

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/;

const ALERT_KINDS: Readonly<Record<string, MarkdownAlertKind>> = {
    NOTE: "note",
    TIP: "tip",
    IMPORTANT: "important",
    WARNING: "warning",
    CAUTION: "caution",
};

/**
 * GitHub alerts are an ordinary blockquote whose first line is `[!WARNING]`.
 * Detecting it after mapping — rather than on the raw source — means it works
 * whichever way marked happened to split that first paragraph.
 */
function extractAlert(blocks: readonly MarkdownBlock[]): {
    alert: MarkdownAlertKind | null;
    blocks: readonly MarkdownBlock[];
} {
    const [first, ...rest] = blocks;

    if (first === undefined || first.kind !== "paragraph") {
        return { alert: null, blocks };
    }

    const [lead, ...tail] = first.children;

    if (lead === undefined || lead.kind !== "text") {
        return { alert: null, blocks };
    }

    const match = ALERT_MARKER.exec(lead.value);

    if (match === null) {
        return { alert: null, blocks };
    }

    const remainder = lead.value.slice(match[0].length);
    const children: MarkdownInline[] =
        remainder.length > 0 ? [{ kind: "text", value: remainder }, ...tail] : tail;

    return {
        alert: ALERT_KINDS[match[1]],
        blocks: children.length > 0 ? [{ kind: "paragraph", children }, ...rest] : rest,
    };
}

/* ------------------------------------------------------------------ block --- */

/**
 * `$$…$$` on its own line arrives as a paragraph holding nothing but display
 * math. Lifting it out keeps the equation a block, which is what centres it.
 */
function liftDisplayMath(children: readonly MarkdownInline[]): MarkdownBlock[] | null {
    const equations = children.filter((child) => child.kind === "math" && child.display);
    const filler = children.filter(
        (child) => !(child.kind === "math" && child.display) && !isBlank(child),
    );

    if (equations.length === 0 || filler.length > 0) {
        return null;
    }

    return equations.map((equation) => ({
        kind: "mathBlock",
        tex: equation.kind === "math" ? equation.tex : "",
    }));
}

function isBlank(node: MarkdownInline): boolean {
    return node.kind === "text" && node.value.trim().length === 0;
}

function mapListItem(item: Tokens.ListItem): MarkdownListItem {
    return {
        checked: item.task ? (item.checked ?? false) : null,
        children: mapBlockTokens(item.tokens.filter((token) => token.type !== "checkbox")),
    };
}

function mapBlockTokens(tokens: readonly Token[], slug?: (title: string) => string) {
    return tokens.flatMap((token) => mapBlock(token, slug));
}

function mapBlock(token: Token, slug?: (title: string) => string): MarkdownBlock[] {
    switch (token.type) {
        case "space":
        case "def":
            return [];
        case "heading": {
            const heading = token as Tokens.Heading;
            const children = mapInlineTokens(heading.tokens);

            return [
                {
                    kind: "heading",
                    depth: clampDepth(heading.depth),
                    id: (slug ?? createSlugger())(plainText(children)),
                    children,
                },
            ];
        }
        case "paragraph":
        case "text": {
            const children = mapInlineTokens(childTokens(token));

            if (children.length === 0) {
                return [];
            }

            return liftDisplayMath(children) ?? [{ kind: "paragraph", children }];
        }
        case "code": {
            const code = token as Tokens.Code;
            // Fence infostrings carry more than the language: ```ts title=a.ts.
            const language = (code.lang ?? "").trim().split(/\s+/)[0] || null;

            return language === DIAGRAM_LANGUAGE
                ? [{ kind: "diagram", source: code.text }]
                : [{ kind: "code", language, value: code.text }];
        }
        case "blockquote": {
            const mapped = mapBlockTokens(childTokens(token), slug);
            const { alert, blocks } = extractAlert(mapped);

            return [{ kind: "blockquote", alert, children: blocks }];
        }
        case "list": {
            const list = token as Tokens.List;
            const start = typeof list.start === "number" ? list.start : 1;

            return [
                {
                    kind: "list",
                    ordered: list.ordered,
                    start,
                    tight: !list.loose,
                    items: list.items.map(mapListItem),
                },
            ];
        }
        case "table": {
            const table = token as Tokens.Table;

            return [
                {
                    kind: "table",
                    header: mapCells(table.header, table.align),
                    rows: table.rows.map((row) => mapCells(row, table.align)),
                },
            ];
        }
        case "hr":
            return [{ kind: "rule" }];
        case "html":
            return [{ kind: "rawHtml", value: token.raw }];
        default:
            return token.raw.trim().length > 0
                ? [{ kind: "paragraph", children: [{ kind: "text", value: token.raw }] }]
                : [];
    }
}

/** The visible words of an inline run, used for anchors and the outline. */
export function plainText(children: readonly MarkdownInline[]): string {
    return children
        .map((child) => {
            switch (child.kind) {
                case "text":
                case "code":
                    return child.value;
                case "math":
                    return child.tex;
                case "image":
                    return child.alt;
                case "break":
                    return " ";
                default:
                    return plainText(child.children);
            }
        })
        .join("");
}

/* ---------------------------------------------------------------- document --- */

function collectOutline(blocks: readonly MarkdownBlock[]): MarkdownOutlineEntry[] {
    return blocks
        .filter((block) => block.kind === "heading")
        .map((block) => ({ id: block.id, depth: block.depth, title: plainText(block.children) }));
}

function containsDiagram(blocks: readonly MarkdownBlock[]): boolean {
    return blocks.some((block) => {
        switch (block.kind) {
            case "diagram":
                return true;
            case "blockquote":
                return containsDiagram(block.children);
            case "list":
                return block.items.some((item) => containsDiagram(item.children));
            default:
                return false;
        }
    });
}

function containsMath(blocks: readonly MarkdownBlock[]): boolean {
    return blocks.some((block) => {
        switch (block.kind) {
            case "mathBlock":
                return true;
            case "heading":
            case "paragraph":
                return hasInlineMath(block.children);
            case "blockquote":
                return containsMath(block.children);
            case "list":
                return block.items.some((item) => containsMath(item.children));
            case "table":
                return [block.header, ...block.rows].some((row) =>
                    row.some((cell) => hasInlineMath(cell.children)),
                );
            default:
                return false;
        }
    });
}

function hasInlineMath(children: readonly MarkdownInline[]): boolean {
    return children.some((child) => {
        switch (child.kind) {
            case "math":
                return true;
            case "strong":
            case "emphasis":
            case "strikethrough":
            case "link":
                return hasInlineMath(child.children);
            default:
                return false;
        }
    });
}

/**
 * The one parse the whole tool runs, shared by the server-rendered first paint
 * and every settled keystroke afterwards. Pure and deterministic.
 */
export function parseMarkdown(source: string): MarkdownParseResult {
    if (source.length > MAX_MARKDOWN_LENGTH) {
        return { ok: false, reason: "too_large" };
    }

    const blocks = mapBlockTokens(markdown.lexer(source), createSlugger());

    return {
        ok: true,
        document: {
            blocks,
            outline: collectOutline(blocks),
            hasDiagrams: containsDiagram(blocks),
            hasMath: containsMath(blocks),
        } satisfies MarkdownDocument,
    };
}
