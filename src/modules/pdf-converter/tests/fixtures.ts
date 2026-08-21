import { zipSync, type Zippable } from "fflate";

/**
 * Open XML packages built byte by byte, rather than checked-in binaries.
 *
 * Three reasons this is worth the lines. A `.docx` in the repository is opaque
 * in a diff, so nobody can see what a test actually asserts. A generated one is
 * *minimal*, so a failure points at the one element the test is about instead
 * of at whichever of four hundred parts Word happened to emit. And it can be
 * malformed on purpose — a package with no `word/document.xml`, a `.pptx` that
 * is really a workbook — which is the half of this module's behaviour that no
 * real file exercises.
 *
 * What it cannot do is prove the readers cope with what Word really writes.
 * That is `docs/case-studies/pdf-converter.md`'s note about verification, and
 * it is why the readers are built on top of Mammoth rather than under it.
 */

const ENCODER = new TextEncoder();

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function pack(files: Record<string, string | Uint8Array>): Uint8Array {
    const zippable: Zippable = {};

    for (const [name, content] of Object.entries(files)) {
        zippable[name] = typeof content === "string" ? ENCODER.encode(content) : content;
    }

    // A fixed timestamp, because a ZIP records local time and a test that
    // rebuilds its own input must not depend on when it ran.
    return zipSync(zippable, { level: 0, mtime: new Date(Date.UTC(2026, 0, 1)) });
}

function relationships(entries: readonly { id: string; type: string; target: string }[]): string {
    const body = entries
        .map(
            (entry) =>
                `<Relationship Id="${entry.id}" Type="${entry.type}" Target="${entry.target}"/>`,
        )
        .join("");

    return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

const OFFICE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/* ------------------------------------------------------------------- docx --- */

export type DocxParagraph = {
    readonly text: string;
    /** A Word style name — `Heading 1`, `Title`. Mammoth maps these to tags. */
    readonly style?: string;
    readonly bold?: boolean;
    readonly italic?: boolean;
};

export function buildDocx(paragraphs: readonly DocxParagraph[]): Uint8Array {
    const body = paragraphs
        .map((paragraph) => {
            const style =
                paragraph.style === undefined
                    ? ""
                    : `<w:pPr><w:pStyle w:val="${paragraph.style.replace(/\s+/g, "")}"/></w:pPr>`;
            const marks = `${paragraph.bold === true ? "<w:b/>" : ""}${paragraph.italic === true ? "<w:i/>" : ""}`;
            const properties = marks.length > 0 ? `<w:rPr>${marks}</w:rPr>` : "";

            return `<w:p>${style}<w:r>${properties}<w:t xml:space="preserve">${escapeXml(paragraph.text)}</w:t></w:r></w:p>`;
        })
        .join("");

    const styles = paragraphs
        .map((paragraph) => paragraph.style)
        .filter((style): style is string => style !== undefined)
        .map(
            (style) =>
                `<w:style w:type="paragraph" w:styleId="${style.replace(/\s+/g, "")}"><w:name w:val="${style}"/></w:style>`,
        )
        .join("");

    return pack({
        "[Content_Types].xml": `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
        "_rels/.rels": relationships([
            {
                id: "rId1",
                type: `${OFFICE_RELATIONSHIP}/officeDocument`,
                target: "word/document.xml",
            },
        ]),
        "word/_rels/document.xml.rels": relationships([
            { id: "rId1", type: `${OFFICE_RELATIONSHIP}/styles`, target: "styles.xml" },
        ]),
        "word/styles.xml": `${XML_HEADER}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`,
        "word/document.xml": `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    });
}

/* ------------------------------------------------------------------- xlsx --- */

export type XlsxSheet = {
    readonly name: string;
    /** Row-major. `null` leaves the cell absent rather than empty. */
    readonly rows: readonly (readonly (string | number | null)[])[];
    readonly hidden?: boolean;
    /** `A1:C1` style references, applied to the first sheet that declares them. */
    readonly merges?: readonly string[];
    /** Column index to style index, for the date and percent formats below. */
    readonly styleByColumn?: Readonly<Record<number, number>>;
};

/**
 * Style index 1 is a built-in date format and index 2 a built-in percentage,
 * so a test can ask for either without writing a style table of its own.
 */
const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="9" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;

function columnName(index: number): string {
    let name = "";
    let value = index + 1;

    while (value > 0) {
        const remainder = (value - 1) % 26;

        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - remainder) / 26);
    }

    return name;
}

export function buildXlsx(sheets: readonly XlsxSheet[], date1904 = false): Uint8Array {
    const shared: string[] = [];
    const indexOf = (text: string) => {
        const existing = shared.indexOf(text);

        if (existing >= 0) {
            return existing;
        }

        shared.push(text);

        return shared.length - 1;
    };

    const files: Record<string, string> = {};

    const sheetXml = sheets.map((sheet, sheetIndex) => {
        const rows = sheet.rows
            .map((row, rowIndex) => {
                const cells = row
                    .map((value, columnIndex) => {
                        if (value === null) {
                            return "";
                        }

                        const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
                        const style = sheet.styleByColumn?.[columnIndex];
                        const styleAttribute = style === undefined ? "" : ` s="${style}"`;

                        if (typeof value === "number") {
                            return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
                        }

                        return `<c r="${reference}"${styleAttribute} t="s"><v>${indexOf(value)}</v></c>`;
                    })
                    .join("");

                return cells.length === 0 ? "" : `<row r="${rowIndex + 1}">${cells}</row>`;
            })
            .join("");

        const merges =
            sheet.merges === undefined || sheet.merges.length === 0
                ? ""
                : `<mergeCells count="${sheet.merges.length}">${sheet.merges
                      .map((reference) => `<mergeCell ref="${reference}"/>`)
                      .join("")}</mergeCells>`;

        files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] =
            `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData>${merges}</worksheet>`;

        return `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheetIndex + 1}" r:id="rId${sheetIndex + 1}"${sheet.hidden === true ? ' state="hidden"' : ""}/>`;
    });

    return pack({
        ...files,
        "_rels/.rels": relationships([
            {
                id: "rId1",
                type: `${OFFICE_RELATIONSHIP}/officeDocument`,
                target: "xl/workbook.xml",
            },
        ]),
        "xl/_rels/workbook.xml.rels": relationships(
            sheets.map((_, index) => ({
                id: `rId${index + 1}`,
                type: `${OFFICE_RELATIONSHIP}/worksheet`,
                target: `worksheets/sheet${index + 1}.xml`,
            })),
        ),
        "xl/sharedStrings.xml": `${XML_HEADER}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
            .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
            .join("")}</sst>`,
        "xl/styles.xml": STYLES_XML,
        "xl/workbook.xml": `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OFFICE_RELATIONSHIP}">${date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${sheetXml.join("")}</sheets></workbook>`,
    });
}

/* ------------------------------------------------------------------- pptx --- */

export type PptxShape = {
    readonly kind: "text" | "picture";
    /** Omitted to test placeholder inheritance from the layout. */
    readonly frame?: { x: number; y: number; cx: number; cy: number };
    readonly placeholder?: { type: string; idx?: string };
    readonly paragraphs?: readonly {
        text: string;
        level?: number;
        sizePt?: number;
        bold?: boolean;
        bulleted?: boolean;
    }[];
    /** Package-relative name under `ppt/media/`, for a picture. */
    readonly image?: string;
};

export type PptxSlide = {
    readonly shapes: readonly PptxShape[];
    readonly notes?: string;
    /** Placeholder boxes the layout provides, keyed `type:idx`. */
    readonly layoutFrames?: Readonly<
        Record<string, { x: number; y: number; cx: number; cy: number }>
    >;
};

/** A one-pixel PNG, so a picture test has real bytes to embed. */
export const TINY_PNG = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
]);

function shapeXml(shape: PptxShape, index: number): string {
    const frame =
        shape.frame === undefined
            ? ""
            : `<a:xfrm><a:off x="${shape.frame.x}" y="${shape.frame.y}"/><a:ext cx="${shape.frame.cx}" cy="${shape.frame.cy}"/></a:xfrm>`;
    const placeholder =
        shape.placeholder === undefined
            ? ""
            : `<p:ph type="${shape.placeholder.type}"${shape.placeholder.idx === undefined ? "" : ` idx="${shape.placeholder.idx}"`}/>`;

    if (shape.kind === "picture") {
        return `<p:pic><p:nvPicPr><p:cNvPr id="${index + 2}" name="Picture ${index}" descr="alt text"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage${index}"/></p:blipFill><p:spPr>${frame}</p:spPr></p:pic>`;
    }

    const paragraphs = (shape.paragraphs ?? [])
        .map((paragraph) => {
            const properties = `<a:pPr${paragraph.level === undefined ? "" : ` lvl="${paragraph.level}"`}>${paragraph.bulleted === false ? "<a:buNone/>" : ""}</a:pPr>`;
            const runProperties =
                paragraph.sizePt === undefined && paragraph.bold !== true
                    ? ""
                    : `<a:rPr${paragraph.sizePt === undefined ? "" : ` sz="${paragraph.sizePt * 100}"`}${paragraph.bold === true ? ' b="1"' : ""}/>`;

            return `<a:p>${properties}<a:r>${runProperties}<a:t>${escapeXml(paragraph.text)}</a:t></a:r></a:p>`;
        })
        .join("");

    return `<p:sp><p:nvSpPr><p:cNvPr id="${index + 2}" name="Shape ${index}"/><p:cNvSpPr/><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:spPr>${frame}</p:spPr><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
}

const PRESENTATION_NAMESPACES = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${OFFICE_RELATIONSHIP}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;

export function buildPptx(
    slides: readonly PptxSlide[],
    size: { width: number; height: number } = { width: 12_192_000, height: 6_858_000 },
): Uint8Array {
    const files: Record<string, string | Uint8Array> = {};

    slides.forEach((slide, slideIndex) => {
        const number = slideIndex + 1;
        const shapes = slide.shapes.map((shape, index) => shapeXml(shape, index)).join("");

        files[`ppt/slides/slide${number}.xml`] =
            `${XML_HEADER}<p:sld ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;

        const slideRelationships: { id: string; type: string; target: string }[] = [
            {
                id: "rIdLayout",
                type: `${OFFICE_RELATIONSHIP}/slideLayout`,
                target: `../slideLayouts/slideLayout${number}.xml`,
            },
        ];

        slide.shapes.forEach((shape, index) => {
            if (shape.kind === "picture" && shape.image !== undefined) {
                files[`ppt/media/${shape.image}`] = TINY_PNG;
                slideRelationships.push({
                    id: `rIdImage${index}`,
                    type: `${OFFICE_RELATIONSHIP}/image`,
                    target: `../media/${shape.image}`,
                });
            }
        });

        if (slide.notes !== undefined) {
            slideRelationships.push({
                id: "rIdNotes",
                type: `${OFFICE_RELATIONSHIP}/notesSlide`,
                target: `../notesSlides/notesSlide${number}.xml`,
            });

            files[`ppt/notesSlides/notesSlide${number}.xml`] =
                `${XML_HEADER}<p:notes ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${escapeXml(slide.notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
        }

        files[`ppt/slides/_rels/slide${number}.xml.rels`] = relationships(slideRelationships);

        const layoutShapes = Object.entries(slide.layoutFrames ?? {})
            .map(([key, frame], index) => {
                const [type, idx] = key.split(":");

                return shapeXml(
                    {
                        kind: "text",
                        frame,
                        placeholder: { type, idx: idx === "" ? undefined : idx },
                        paragraphs: [{ text: "" }],
                    },
                    index,
                );
            })
            .join("");

        files[`ppt/slideLayouts/slideLayout${number}.xml`] =
            `${XML_HEADER}<p:sldLayout ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree>${layoutShapes}</p:spTree></p:cSld></p:sldLayout>`;
    });

    return pack({
        ...files,
        "_rels/.rels": relationships([
            {
                id: "rId1",
                type: `${OFFICE_RELATIONSHIP}/officeDocument`,
                target: "ppt/presentation.xml",
            },
        ]),
        "ppt/_rels/presentation.xml.rels": relationships(
            slides.map((_, index) => ({
                id: `rId${index + 2}`,
                type: `${OFFICE_RELATIONSHIP}/slide`,
                target: `slides/slide${index + 1}.xml`,
            })),
        ),
        "ppt/presentation.xml": `${XML_HEADER}<p:presentation ${PRESENTATION_NAMESPACES}><p:sldIdLst>${slides
            .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
            .join(
                "",
            )}</p:sldIdLst><p:sldSz cx="${size.width}" cy="${size.height}"/></p:presentation>`,
    });
}

/* ------------------------------------------------------------------ other --- */

/** A ZIP that is a valid archive but not any Open XML document. */
export function buildStrangerPackage(): Uint8Array {
    return pack({ "readme.txt": "not an office document" });
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
