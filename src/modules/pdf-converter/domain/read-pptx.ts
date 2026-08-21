import type {
    DocBlock,
    EmbeddedImage,
    InlineRun,
    PdfTruncation,
    Slide,
    SlideFrame,
    SlideParagraph,
    SlidePlaceholder,
    SlideShape,
    TableCell,
} from "../types";
import { normalizeRuns, plainRun, trimRuns } from "./blocks";
import { DEFAULT_SLIDE_HEIGHT_EMU, DEFAULT_SLIDE_WIDTH_EMU, MAX_PDF_SLIDES } from "./constants";
import {
    attribute,
    childPath,
    childrenNamed,
    descendantsNamed,
    embedPackageImage,
    numericAttribute,
    readEntryXml,
    readRelationships,
    resolvePackagePath,
    type OoxmlPackage,
    type Relationships,
} from "./package";

/**
 * A deck read shape by shape, keeping where each shape sits.
 *
 * The alternative — pulling every `<a:t>` out of a slide and flowing the result
 * down a page — is much less code and produces something nobody recognises. A
 * slide *is* its arrangement: a title against a diagram, two columns compared,
 * a caption under a photograph. Flattening that to a bullet list does not lose
 * decoration, it loses the argument the slide was making.
 *
 * So each shape keeps its `<a:xfrm>` box in English Metric Units, and the
 * renderer scales the whole slide onto a page. Everything below is the parts of
 * DrawingML needed to fill that box: the text and its marks, the outline level,
 * the alignment, the pictures, the tables, and the group transform that says
 * where a shape inside a group actually is.
 */

export type PptxReadResult = {
    readonly slides: readonly Slide[];
    readonly title: string | null;
    readonly slideWidthEmu: number;
    readonly slideHeightEmu: number;
    readonly droppedImageTypes: readonly string[];
    readonly truncated: readonly PdfTruncation[];
    readonly empty: boolean;
};

export type PptxReadOptions = {
    readonly includeImages: boolean;
    readonly includeSpeakerNotes: boolean;
};

const SLIDE_LAYOUT_RELATIONSHIP =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";

const NOTES_SLIDE_RELATIONSHIP =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";

/* ------------------------------------------------------------------ frame --- */

const ZERO_FRAME: SlideFrame = { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 0 };

/** A shape's own box, or `null` when it inherits one from its layout. */
function readFrame(shape: Element, xfrmName: string): SlideFrame | null {
    const properties =
        childPath(shape, "p:spPr") ?? childPath(shape, "p:grpSpPr") ?? childPath(shape, "p:xfrm");
    const transform =
        childPath(shape, xfrmName) ??
        (properties === null ? null : childPath(properties, "a:xfrm"));

    if (transform === null) {
        return null;
    }

    const offset = childPath(transform, "a:off");
    const extent = childPath(transform, "a:ext");
    const xEmu = numericAttribute(offset, "x");
    const yEmu = numericAttribute(offset, "y");
    const widthEmu = numericAttribute(extent, "cx");
    const heightEmu = numericAttribute(extent, "cy");

    if (xEmu === null || yEmu === null || widthEmu === null || heightEmu === null) {
        return null;
    }

    return { xEmu, yEmu, widthEmu, heightEmu };
}

/**
 * A group's own transform, which is two boxes rather than one: where the group
 * sits on the slide, and the coordinate space its children were authored in.
 *
 * A child at `chOff.x` maps to the group's `off.x`, and every EMU of `chExt`
 * maps to `ext / chExt` EMU on the slide. Without this a shape inside a group
 * lands at its *authoring* coordinates, which on a scaled group is somewhere
 * else entirely — usually off the page.
 */
type GroupTransform = {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly scaleX: number;
    readonly scaleY: number;
};

const IDENTITY: GroupTransform = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };

function readGroupTransform(group: Element, parent: GroupTransform): GroupTransform {
    const properties = childPath(group, "p:grpSpPr");
    const transform = properties === null ? null : childPath(properties, "a:xfrm");

    if (transform === null) {
        return parent;
    }

    const offset = childPath(transform, "a:off");
    const extent = childPath(transform, "a:ext");
    const childOffset = childPath(transform, "a:chOff");
    const childExtent = childPath(transform, "a:chExt");

    const x = numericAttribute(offset, "x") ?? 0;
    const y = numericAttribute(offset, "y") ?? 0;
    const width = numericAttribute(extent, "cx") ?? 0;
    const height = numericAttribute(extent, "cy") ?? 0;
    const childX = numericAttribute(childOffset, "x") ?? 0;
    const childY = numericAttribute(childOffset, "y") ?? 0;
    const childWidth = numericAttribute(childExtent, "cx") ?? 0;
    const childHeight = numericAttribute(childExtent, "cy") ?? 0;

    // A zero child extent is a group with nothing in it to scale against.
    // Dividing by it would put every child at infinity.
    const scaleX = childWidth > 0 ? width / childWidth : 1;
    const scaleY = childHeight > 0 ? height / childHeight : 1;

    return {
        offsetX: parent.offsetX + (x - childX * scaleX) * parent.scaleX,
        offsetY: parent.offsetY + (y - childY * scaleY) * parent.scaleY,
        scaleX: parent.scaleX * scaleX,
        scaleY: parent.scaleY * scaleY,
    };
}

function applyTransform(frame: SlideFrame, transform: GroupTransform): SlideFrame {
    return {
        xEmu: transform.offsetX + frame.xEmu * transform.scaleX,
        yEmu: transform.offsetY + frame.yEmu * transform.scaleY,
        widthEmu: frame.widthEmu * transform.scaleX,
        heightEmu: frame.heightEmu * transform.scaleY,
    };
}

/* ------------------------------------------------------------ placeholders --- */

type PlaceholderKey = string;

/** `type` and `idx` together, which is how a layout's slots are addressed. */
function placeholderKeyOf(shape: Element): PlaceholderKey | null {
    const placeholder = childPath(shape, "p:nvSpPr", "p:nvPr", "p:ph");

    if (placeholder === null) {
        return null;
    }

    return `${attribute(placeholder, "type") ?? "body"}:${attribute(placeholder, "idx") ?? ""}`;
}

function placeholderKindOf(shape: Element): SlidePlaceholder {
    const placeholder = childPath(shape, "p:nvSpPr", "p:nvPr", "p:ph");

    if (placeholder === null) {
        return "other";
    }

    const type = attribute(placeholder, "type") ?? "body";

    if (type === "title" || type === "ctrTitle") {
        return "title";
    }

    return type === "body" || type === "subTitle" || type === "" ? "body" : "other";
}

/**
 * Where the layout puts each of its slots.
 *
 * A slide that reuses a layout's placeholder usually omits `<a:xfrm>`
 * altogether, because the position is the layout's to decide. Without this
 * table every such shape would land at the top-left corner, stacked on top of
 * one another.
 */
function readLayoutFrames(pkg: OoxmlPackage, layoutPath: string): ReadonlyMap<string, SlideFrame> {
    const root = readEntryXml(pkg, layoutPath);
    const frames = new Map<string, SlideFrame>();

    if (root === null) {
        return frames;
    }

    for (const shape of descendantsNamed(root, "p:sp")) {
        const key = placeholderKeyOf(shape);
        const frame = readFrame(shape, "p:xfrm");

        if (key !== null && frame !== null) {
            frames.set(key, frame);
        }
    }

    return frames;
}

/* ------------------------------------------------------------------- text --- */

/**
 * `sz` is in hundredths of a point — `sz="1800"` is eighteen point. Returned as
 * `null` when absent so the renderer can size by placeholder instead, which is
 * a better guess than a constant.
 */
function readRunSize(properties: Element | null): number | null {
    const hundredths = numericAttribute(properties, "sz");

    return hundredths === null || hundredths <= 0 ? null : hundredths / 100;
}

function readRunMarks(properties: Element | null, relationships: Relationships): InlineRun {
    const link = childPath(properties, "a:hlinkClick");
    const relationshipId = attribute(link, "r:id");
    const target = relationshipId === null ? undefined : relationships.get(relationshipId)?.target;

    return {
        text: "",
        bold: attribute(properties, "b") === "1" || undefined,
        italic: attribute(properties, "i") === "1" || undefined,
        underline:
            (attribute(properties, "u") !== null && attribute(properties, "u") !== "none") ||
            undefined,
        strike:
            (attribute(properties, "strike") !== null &&
                attribute(properties, "strike") !== "noStrike") ||
            undefined,
        link: target !== undefined && /^https?:/i.test(target) ? target : undefined,
    };
}

const ALIGNMENTS: Readonly<Record<string, SlideParagraph["align"]>> = {
    l: "left",
    ctr: "center",
    r: "right",
    just: "justify",
};

function readParagraph(paragraph: Element, relationships: Relationships): SlideParagraph {
    const properties = childPath(paragraph, "a:pPr");
    const runs: InlineRun[] = [];
    let sizePt: number | null = null;

    for (let index = 0; index < paragraph.childNodes.length; index += 1) {
        const node = paragraph.childNodes[index];

        if (node.nodeType !== 1) {
            continue;
        }

        const element = node as Element;

        // `<a:br/>` is a line break inside one paragraph, not a new one. Kept
        // as a newline so the renderer wraps at the same place the deck did.
        if (element.nodeName === "a:br") {
            runs.push({ text: "\n" });

            continue;
        }

        // `<a:fld>` is a field — a slide number, a date. Its cached `<a:t>` is
        // what the deck last showed, which is the only value available here.
        if (element.nodeName !== "a:r" && element.nodeName !== "a:fld") {
            continue;
        }

        const runProperties = childPath(element, "a:rPr");
        const text = childrenNamed(element, "a:t")
            .map((node) => node.textContent ?? "")
            .join("");

        if (text.length === 0) {
            continue;
        }

        sizePt = sizePt ?? readRunSize(runProperties);
        runs.push({ ...readRunMarks(runProperties, relationships), text });
    }

    return {
        level: numericAttribute(properties, "lvl") ?? 0,
        // A bullet is the default in a body placeholder; `<a:buNone/>` is how a
        // deck turns it off, and it is the only reliable signal available
        // without resolving the master's list styles.
        bulleted: properties === null ? true : childPath(properties, "a:buNone") === null,
        align: ALIGNMENTS[attribute(properties, "algn") ?? ""] ?? "left",
        sizePt,
        runs: normalizeRuns(runs),
    };
}

/* ----------------------------------------------------------------- shapes --- */

type ShapeCollector = {
    readonly shapes: SlideShape[];
    readonly droppedImageTypes: Set<string>;
};

function collectShapes(
    tree: Element,
    transform: GroupTransform,
    context: {
        readonly pkg: OoxmlPackage;
        readonly slidePath: string;
        readonly relationships: Relationships;
        readonly layoutFrames: ReadonlyMap<string, SlideFrame>;
        readonly options: PptxReadOptions;
    },
    into: ShapeCollector,
): void {
    for (let index = 0; index < tree.childNodes.length; index += 1) {
        const node = tree.childNodes[index];

        if (node.nodeType !== 1) {
            continue;
        }

        const element = node as Element;

        switch (element.nodeName) {
            case "p:grpSp":
                collectShapes(element, readGroupTransform(element, transform), context, into);

                break;

            case "p:sp":
                collectTextShape(element, transform, context, into);

                break;

            case "p:pic":
                collectPicture(element, transform, context, into);

                break;

            case "p:graphicFrame":
                collectGraphicFrame(element, transform, into);

                break;

            default:
                break;
        }
    }
}

function frameFor(
    shape: Element,
    transform: GroupTransform,
    layoutFrames: ReadonlyMap<string, SlideFrame>,
): SlideFrame {
    const own = readFrame(shape, "p:xfrm");

    if (own !== null) {
        return applyTransform(own, transform);
    }

    const key = placeholderKeyOf(shape);
    const inherited = key === null ? undefined : layoutFrames.get(key);

    // A layout frame is already in slide coordinates, so the group transform
    // does not apply to it — a placeholder inside a group is a case
    // PowerPoint itself does not produce.
    return inherited ?? ZERO_FRAME;
}

function collectTextShape(
    shape: Element,
    transform: GroupTransform,
    context: Parameters<typeof collectShapes>[2],
    into: ShapeCollector,
): void {
    const body = childPath(shape, "p:txBody");

    if (body === null) {
        return;
    }

    const paragraphs = childrenNamed(body, "a:p")
        .map((paragraph) => readParagraph(paragraph, context.relationships))
        .filter((paragraph) => paragraph.runs.length > 0);

    if (paragraphs.length === 0) {
        return;
    }

    into.shapes.push({
        kind: "text",
        frame: frameFor(shape, transform, context.layoutFrames),
        placeholder: placeholderKindOf(shape),
        paragraphs,
    });
}

function collectPicture(
    picture: Element,
    transform: GroupTransform,
    context: Parameters<typeof collectShapes>[2],
    into: ShapeCollector,
): void {
    if (!context.options.includeImages) {
        return;
    }

    const blip = childPath(picture, "p:blipFill", "a:blip");
    const relationshipId = attribute(blip, "r:embed");
    const target =
        relationshipId === null
            ? null
            : (context.relationships.get(relationshipId)?.target ?? null);
    const path = target === null ? null : resolvePackagePath(context.slidePath, target);

    if (path === null) {
        return;
    }

    const embedded = embedPackageImage(context.pkg, path);

    if (!embedded.ok) {
        into.droppedImageTypes.add(embedded.droppedType);

        return;
    }

    const image: EmbeddedImage = {
        ...embedded.image,
        alt: attribute(childPath(picture, "p:nvPicPr", "p:cNvPr"), "descr"),
    };

    into.shapes.push({
        kind: "image",
        frame: frameFor(picture, transform, context.layoutFrames),
        image,
    });
}

/**
 * A `<p:graphicFrame>` holding a DrawingML table.
 *
 * Charts and diagrams also arrive in a graphic frame, and both are drawings
 * this tool has no way to render — they are left out rather than replaced with
 * a placeholder box, which would be a shape the deck never had.
 */
function collectGraphicFrame(
    frameElement: Element,
    transform: GroupTransform,
    into: ShapeCollector,
): void {
    const table = childPath(frameElement, "a:graphic", "a:graphicData", "a:tbl");

    if (table === null) {
        return;
    }

    const own = readFrame(frameElement, "p:xfrm");
    const rows: TableCell[][] = [];

    for (const row of childrenNamed(table, "a:tr")) {
        const cells: TableCell[] = [];

        for (const cell of childrenNamed(row, "a:tc")) {
            const text = descendantsNamed(cell, "a:t")
                .map((node) => node.textContent ?? "")
                .join("");

            cells.push({ runs: trimRuns([plainRun(text)]) });
        }

        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    if (rows.length === 0) {
        return;
    }

    const properties = childPath(table, "a:tblPr");
    const hasHeaderRow = attribute(properties, "firstRow") === "1";
    const [first, ...rest] = rows;

    into.shapes.push({
        kind: "table",
        frame: own === null ? ZERO_FRAME : applyTransform(own, transform),
        head: hasHeaderRow ? first : null,
        rows: hasHeaderRow ? rest : rows,
    });
}

/* ------------------------------------------------------------------ notes --- */

function readNotes(pkg: OoxmlPackage, notesPath: string): readonly DocBlock[] {
    const root = readEntryXml(pkg, notesPath);

    if (root === null) {
        return [];
    }

    const blocks: DocBlock[] = [];

    for (const shape of descendantsNamed(root, "p:sp")) {
        // Only the body placeholder. A notes page also carries a thumbnail of
        // the slide and a slide-number field, and neither is a speaker note.
        if (placeholderKindOf(shape) !== "body") {
            continue;
        }

        const body = childPath(shape, "p:txBody");

        if (body === null) {
            continue;
        }

        for (const paragraph of childrenNamed(body, "a:p")) {
            const text = descendantsNamed(paragraph, "a:t")
                .map((node) => node.textContent ?? "")
                .join("");

            if (text.trim().length > 0) {
                blocks.push({ kind: "paragraph", runs: [plainRun(text)] });
            }
        }
    }

    return blocks;
}

/* -------------------------------------------------------------- the whole --- */

function readSlidePaths(pkg: OoxmlPackage): readonly string[] {
    const presentation = readEntryXml(pkg, "ppt/presentation.xml");

    if (presentation === null) {
        return [];
    }

    const relationships = readRelationships(pkg, "ppt/presentation.xml");
    const list = childrenNamed(presentation, "p:sldIdLst")[0] ?? null;
    const paths: string[] = [];

    for (const slide of list === null ? [] : childrenNamed(list, "p:sldId")) {
        const relationshipId = attribute(slide, "r:id");
        const target =
            relationshipId === null ? null : (relationships.get(relationshipId)?.target ?? null);
        const path = target === null ? null : resolvePackagePath("ppt/presentation.xml", target);

        if (path !== null && pkg.entries.has(path)) {
            paths.push(path);
        }
    }

    return paths;
}

function readSlideSize(pkg: OoxmlPackage): { width: number; height: number } {
    const presentation = readEntryXml(pkg, "ppt/presentation.xml");
    const size = presentation === null ? null : childPath(presentation, "p:sldSz");
    const width = numericAttribute(size, "cx");
    const height = numericAttribute(size, "cy");

    return {
        width: width !== null && width > 0 ? width : DEFAULT_SLIDE_WIDTH_EMU,
        height: height !== null && height > 0 ? height : DEFAULT_SLIDE_HEIGHT_EMU,
    };
}

/** The first title placeholder in the deck, which is what names the PDF file. */
function readDeckTitle(slides: readonly Slide[]): string | null {
    for (const slide of slides) {
        for (const shape of slide.shapes) {
            if (shape.kind !== "text" || shape.placeholder !== "title") {
                continue;
            }

            const text = shape.paragraphs
                .flatMap((paragraph) => paragraph.runs.map((run) => run.text))
                .join("")
                .trim();

            if (text.length > 0) {
                return text;
            }
        }
    }

    return null;
}

export function readPptx(pkg: OoxmlPackage, options: PptxReadOptions): PptxReadResult | null {
    const paths = readSlidePaths(pkg);

    if (paths.length === 0) {
        return null;
    }

    const size = readSlideSize(pkg);
    const truncated: PdfTruncation[] = [];
    const kept = paths.slice(0, MAX_PDF_SLIDES);

    if (kept.length < paths.length) {
        truncated.push({ kind: "slides", kept: kept.length, total: paths.length });
    }

    const droppedImageTypes = new Set<string>();
    const slides: Slide[] = [];

    for (const [index, slidePath] of kept.entries()) {
        const root = readEntryXml(pkg, slidePath);

        if (root === null) {
            continue;
        }

        const tree = childPath(root, "p:cSld", "p:spTree");

        if (tree === null) {
            continue;
        }

        const relationships = readRelationships(pkg, slidePath);
        const layoutTarget = [...relationships.values()].find(
            (relationship) => relationship.type === SLIDE_LAYOUT_RELATIONSHIP,
        )?.target;
        const layoutPath =
            layoutTarget === undefined ? null : resolvePackagePath(slidePath, layoutTarget);

        const collector: ShapeCollector = { shapes: [], droppedImageTypes };

        collectShapes(
            tree,
            IDENTITY,
            {
                pkg,
                slidePath,
                relationships,
                layoutFrames: layoutPath === null ? new Map() : readLayoutFrames(pkg, layoutPath),
                options,
            },
            collector,
        );

        const notesTarget = options.includeSpeakerNotes
            ? [...relationships.values()].find(
                  (relationship) => relationship.type === NOTES_SLIDE_RELATIONSHIP,
              )?.target
            : undefined;
        const notesPath =
            notesTarget === undefined ? null : resolvePackagePath(slidePath, notesTarget);

        slides.push({
            number: index + 1,
            shapes: collector.shapes,
            notes: notesPath === null ? [] : readNotes(pkg, notesPath),
        });
    }

    return {
        slides,
        title: readDeckTitle(slides),
        slideWidthEmu: size.width,
        slideHeightEmu: size.height,
        droppedImageTypes: [...droppedImageTypes].sort(),
        truncated,
        empty: slides.every((slide) => slide.shapes.length === 0),
    };
}
