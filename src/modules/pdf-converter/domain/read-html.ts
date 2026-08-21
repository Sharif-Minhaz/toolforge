import { NodeType, parse, type HTMLElement, type Node, type TextNode } from "node-html-parser";

import type { DocBlock, HeadingLevel, InlineRun, ListItem, TableCell } from "../types";
import { collapseWhitespace, dropEmptyBlocks, normalizeRuns, trimRuns } from "./blocks";

/**
 * HTML in, blocks out.
 *
 * This is the seam the whole tool is built around: HTML, Markdown, MDX and
 * Word all arrive here, because Markdown is HTML once Marked has run and a
 * `.docx` is HTML once Mammoth has. One reader means one answer to "what does a
 * nested list inside a table cell become", instead of four.
 *
 * The parser is depended on rather than written, under decision tree 45's first
 * branch read backwards: the *input* is authored by everybody — a scraper, a
 * CMS, Word's own exporter — and a hand-rolled tokeniser would meet its first
 * unclosed `<p>` inside somebody's saved page rather than in a test.
 */

export type HtmlReadOptions = {
    readonly includeImages: boolean;
};

export type HtmlReadResult = {
    readonly blocks: readonly DocBlock[];
    /** Media types of pictures that could not be embedded, deduplicated. */
    readonly droppedImageTypes: readonly string[];
};

/**
 * Elements whose content was never prose.
 *
 * Dropped rather than unwrapped, for the reason the HTML / Markdown converter's
 * case study spells out: a default rule that unwraps turns `alert(1)` into a
 * paragraph of the document. A stylesheet's selector list is the same mistake
 * in a different hat, and `<head>` was never text.
 */
const DISCARDED = new Set([
    "script",
    "style",
    "noscript",
    "head",
    "title",
    "meta",
    "link",
    "base",
    "template",
    "iframe",
    "object",
    "embed",
    "canvas",
    "audio",
    "video",
    "svg",
    "math",
    "form",
    "input",
    "button",
    "select",
    "textarea",
]);

/** Elements that add marks to the text around them rather than breaking it. */
const INLINE = new Set([
    "a",
    "abbr",
    "b",
    "big",
    "br",
    "cite",
    "code",
    "del",
    "dfn",
    "em",
    "i",
    "ins",
    "kbd",
    "label",
    "mark",
    "q",
    "s",
    "samp",
    "small",
    "span",
    "strike",
    "strong",
    "sub",
    "sup",
    "time",
    "tt",
    "u",
    "var",
    "wbr",
]);

const HEADING_LEVELS: Readonly<Record<string, HeadingLevel>> = {
    h1: 1,
    h2: 2,
    h3: 3,
    h4: 4,
    h5: 5,
    h6: 6,
};

/** The marks in force at one point in the walk. Copied down, never mutated. */
type Marks = {
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly underline?: boolean;
    readonly strike?: boolean;
    readonly code?: boolean;
    readonly link?: string;
};

const MARK_BY_TAG: Readonly<Record<string, keyof Marks>> = {
    b: "bold",
    strong: "bold",
    i: "italic",
    em: "italic",
    cite: "italic",
    dfn: "italic",
    var: "italic",
    u: "underline",
    ins: "underline",
    s: "strike",
    strike: "strike",
    del: "strike",
    code: "code",
    kbd: "code",
    samp: "code",
    tt: "code",
};

function tagOf(node: Node): string {
    return ((node as HTMLElement).rawTagName ?? "").toLowerCase();
}

function isElement(node: Node): node is HTMLElement {
    return node.nodeType === NodeType.ELEMENT_NODE;
}

function isText(node: Node): node is TextNode {
    return node.nodeType === NodeType.TEXT_NODE;
}

/**
 * A link's destination, kept only when it points somewhere a PDF reader can go.
 *
 * `javascript:` and `data:` are dropped: a PDF viewer that follows either is a
 * viewer with a security bug, and a link this tool writes should not be the
 * thing that finds it. An in-page `#anchor` is dropped too — the anchor it
 * named does not exist in the PDF.
 */
function usableHref(raw: string | undefined): string | undefined {
    if (raw === undefined) {
        return undefined;
    }

    const href = raw.trim();

    if (href.length === 0 || href.startsWith("#")) {
        return undefined;
    }

    return /^(https?:|mailto:|tel:)/i.test(href) ? href : undefined;
}

/** Accepts only what PDF can actually store, and names what it turned away. */
function readImageSource(
    source: string | undefined,
): { readonly ok: true; readonly dataUri: string } | { readonly ok: false; readonly type: string } {
    const value = source?.trim() ?? "";

    if (value.length === 0) {
        return { ok: false, type: "unknown" };
    }

    const match = /^data:(image\/(?:png|jpeg));base64,/i.exec(value);

    if (match !== null) {
        return { ok: true, dataUri: value };
    }

    if (value.startsWith("data:")) {
        return { ok: false, type: /^data:([^;,]+)/.exec(value)?.[1]?.toLowerCase() ?? "data" };
    }

    // A remote address is not a failure of the picture — it is this tool
    // refusing to fetch it. Nothing in a document somebody dropped in gets to
    // make a request from their browser, which is the whole of the promise the
    // page makes above these controls.
    return { ok: false, type: "remote" };
}

class HtmlReader {
    private readonly blocks: DocBlock[] = [];

    private readonly droppedImageTypes = new Set<string>();

    private pending: InlineRun[] = [];

    constructor(private readonly options: HtmlReadOptions) {}

    read(root: HTMLElement): HtmlReadResult {
        this.walkBlocks(root, {});
        this.flushParagraph();

        return {
            blocks: dropEmptyBlocks(this.blocks),
            droppedImageTypes: [...this.droppedImageTypes].sort(),
        };
    }

    /* -------------------------------------------------------------- blocks --- */

    private walkBlocks(element: HTMLElement, marks: Marks): void {
        for (const node of element.childNodes) {
            if (isText(node)) {
                this.pushText(node.text, marks, false);

                continue;
            }

            if (!isElement(node)) {
                continue;
            }

            const tag = tagOf(node);

            if (DISCARDED.has(tag)) {
                continue;
            }

            if (INLINE.has(tag)) {
                this.collectInline(node, marks);

                continue;
            }

            this.handleBlock(node, tag, marks);
        }
    }

    private handleBlock(node: HTMLElement, tag: string, marks: Marks): void {
        const heading = HEADING_LEVELS[tag];

        if (heading !== undefined) {
            this.flushParagraph();
            this.emitInlineBlock(node, marks, (runs) => ({
                kind: "heading",
                level: heading,
                runs,
            }));

            return;
        }

        switch (tag) {
            case "p":
            case "figcaption":
            case "dd":
            case "dt":
                this.flushParagraph();
                this.emitInlineBlock(node, marks, (runs) => ({ kind: "paragraph", runs }));

                return;

            case "blockquote":
                this.flushParagraph();
                this.emitInlineBlock(node, marks, (runs) => ({ kind: "quote", runs }));

                return;

            case "pre":
                this.flushParagraph();
                // Not `collapseWhitespace`: the whitespace is the content. The
                // trailing newline every `<pre>` carries is the one exception,
                // since it would otherwise draw an empty final line.
                this.blocks.push({ kind: "code", text: node.textContent.replace(/\n$/, "") });

                return;

            case "hr":
                this.flushParagraph();
                this.blocks.push({ kind: "rule" });

                return;

            case "ul":
            case "ol":
                this.flushParagraph();
                this.emitList(node, tag === "ol", marks);

                return;

            case "table":
                this.flushParagraph();
                this.emitTable(node, marks);

                return;

            case "img":
                this.flushParagraph();
                this.emitImage(node);

                return;

            default:
                // Everything structural — div, section, article, li outside a
                // list, whatever a CMS invented — is a container rather than a
                // thing to draw. Walking through it keeps its contents;
                // rendering it would draw a box nobody asked for.
                this.walkBlocks(node, marks);
        }
    }

    private emitInlineBlock(
        node: HTMLElement,
        marks: Marks,
        build: (runs: readonly InlineRun[]) => DocBlock,
    ): void {
        const runs = this.readInline(node, marks);

        if (runs.length > 0) {
            this.blocks.push(build(runs));
        }
    }

    private emitImage(node: HTMLElement): void {
        if (!this.options.includeImages) {
            return;
        }

        const source = readImageSource(node.getAttribute("src"));

        if (!source.ok) {
            this.droppedImageTypes.add(source.type);

            return;
        }

        const alt = node.getAttribute("alt")?.trim();

        this.blocks.push({
            kind: "image",
            image: {
                dataUri: source.dataUri,
                widthPx: readPixelAttribute(node.getAttribute("width")),
                heightPx: readPixelAttribute(node.getAttribute("height")),
                alt: alt !== undefined && alt.length > 0 ? alt : null,
            },
        });
    }

    /* ---------------------------------------------------------------- lists --- */

    private emitList(node: HTMLElement, ordered: boolean, marks: Marks): void {
        const items: ListItem[] = [];

        this.collectListItems(node, ordered, 0, marks, items);

        if (items.length > 0) {
            this.blocks.push({ kind: "list", ordered, items });
        }
    }

    /**
     * Nested lists are flattened to a level number rather than kept as a tree.
     *
     * A nested `<ul>` is a child of the `<li>` above it, not a sibling, so its
     * items belong to the same visual list at one more level of indent — which
     * is exactly what the renderer draws from. Keeping the tree would mean
     * emitting a list inside a list item, and `pdfmake` counts an ordered list
     * restarted inside another from one.
     */
    private collectListItems(
        list: HTMLElement,
        ordered: boolean,
        level: number,
        marks: Marks,
        items: ListItem[],
    ): void {
        for (const child of list.childNodes) {
            if (!isElement(child) || tagOf(child) !== "li") {
                continue;
            }

            const own: Node[] = [];
            const nested: HTMLElement[] = [];

            for (const node of child.childNodes) {
                if (isElement(node) && (tagOf(node) === "ul" || tagOf(node) === "ol")) {
                    nested.push(node);

                    continue;
                }

                own.push(node);
            }

            const runs = this.readInlineNodes(own, marks);

            if (runs.length > 0) {
                items.push({ level, runs });
            }

            for (const sublist of nested) {
                this.collectListItems(sublist, ordered, level + 1, marks, items);
            }
        }
    }

    /* --------------------------------------------------------------- tables --- */

    private emitTable(node: HTMLElement, marks: Marks): void {
        const rows: TableCell[][] = [];
        let head: TableCell[] | null = null;

        for (const row of node.querySelectorAll("tr")) {
            const cells: TableCell[] = [];
            let allHeaders = true;

            for (const cell of row.childNodes) {
                if (!isElement(cell)) {
                    continue;
                }

                const tag = tagOf(cell);

                if (tag !== "td" && tag !== "th") {
                    continue;
                }

                if (tag === "td") {
                    allHeaders = false;
                }

                cells.push({
                    runs: this.readInline(cell, marks),
                    colSpan: readSpanAttribute(cell.getAttribute("colspan")),
                    rowSpan: readSpanAttribute(cell.getAttribute("rowspan")),
                });
            }

            if (cells.length === 0) {
                continue;
            }

            // The first all-`<th>` row is the header whether or not somebody
            // wrapped it in a `<thead>`. Hand-written tables rarely do, and a
            // table whose header repeats on page two is the whole reason to
            // know which row it is.
            if (head === null && allHeaders && rows.length === 0) {
                head = cells;

                continue;
            }

            rows.push(cells);
        }

        if (head !== null || rows.length > 0) {
            const caption = node.querySelector("caption")?.textContent.trim() ?? "";

            this.blocks.push({
                kind: "table",
                head,
                rows,
                caption: caption.length > 0 ? caption : null,
            });
        }
    }

    /* --------------------------------------------------------------- inline --- */

    private collectInline(node: HTMLElement, marks: Marks): void {
        const tag = tagOf(node);

        if (tag === "br") {
            this.pending.push({ ...marks, text: "\n" });

            return;
        }

        this.pending.push(...this.readInline(node, marks));
    }

    /** The runs under one element, without touching the paragraph buffer. */
    private readInline(element: HTMLElement, marks: Marks): readonly InlineRun[] {
        return this.readInlineNodes([...element.childNodes], marksFor(element, marks));
    }

    private readInlineNodes(nodes: readonly Node[], marks: Marks): readonly InlineRun[] {
        const runs: InlineRun[] = [];

        for (const node of nodes) {
            if (isText(node)) {
                runs.push({ ...marks, text: collapseWhitespace(node.text) });

                continue;
            }

            if (!isElement(node)) {
                continue;
            }

            const tag = tagOf(node);

            if (DISCARDED.has(tag)) {
                continue;
            }

            if (tag === "br") {
                runs.push({ ...marks, text: "\n" });

                continue;
            }

            // A block element inside a paragraph — a `<div>` inside a `<td>`,
            // a `<p>` inside an `<li>` — contributes its text rather than
            // starting a block of its own. Anything else would reorder the
            // document, which is worse than losing the paragraph break.
            runs.push(...this.readInlineNodes([...node.childNodes], marksFor(node, marks)));
        }

        return trimRuns(runs);
    }

    private pushText(text: string, marks: Marks, preserve: boolean): void {
        const value = preserve ? text : collapseWhitespace(text);

        if (value.trim().length === 0) {
            return;
        }

        this.pending.push({ ...marks, text: value });
    }

    /**
     * Loose text between block elements becomes its own paragraph.
     *
     * Plenty of real HTML never wraps its prose in a `<p>` at all — a saved
     * email, a `<td>` full of text, a CMS that emits `<br>` instead. Dropping
     * it would lose the document; this keeps it.
     */
    private flushParagraph(): void {
        const runs = trimRuns(normalizeRuns(this.pending));

        this.pending = [];

        if (runs.length > 0) {
            this.blocks.push({ kind: "paragraph", runs });
        }
    }
}

function marksFor(element: HTMLElement, inherited: Marks): Marks {
    const tag = tagOf(element);
    const mark = MARK_BY_TAG[tag];
    const next: Marks = mark === undefined ? inherited : { ...inherited, [mark]: true };

    if (tag !== "a") {
        return next;
    }

    const href = usableHref(element.getAttribute("href"));

    return href === undefined ? next : { ...next, link: href };
}

function readPixelAttribute(raw: string | undefined): number | null {
    if (raw === undefined) {
        return null;
    }

    const value = Number.parseInt(raw, 10);

    return Number.isFinite(value) && value > 0 ? value : null;
}

function readSpanAttribute(raw: string | undefined): number | undefined {
    if (raw === undefined) {
        return undefined;
    }

    const value = Number.parseInt(raw, 10);

    return Number.isFinite(value) && value > 1 ? value : undefined;
}

export function readHtml(html: string, options: HtmlReadOptions): HtmlReadResult {
    // `<pre>` is deliberately *not* a block-text element here. Marking it one
    // hands back the raw markup of the `<code>` inside it as literal text, so
    // a fenced Markdown block would arrive in the PDF wearing its own tags.
    const root = parse(html, {
        comment: false,
        blockTextElements: { script: true, style: true, noscript: true },
    });

    return new HtmlReader(options).read(root);
}
