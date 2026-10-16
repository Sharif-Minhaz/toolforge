import { parseXml, readEntryText, type XmlPackage } from "@/modules/tools/domain/xml-package";

/**
 * The text of an OpenDocument text file — LibreOffice's and Google Docs'
 * `.odt` — read from `content.xml`.
 *
 * Paragraphs and headings are `text:p` and `text:h` wherever they sit — in
 * the body, a list item, a table cell, a frame — so the walk looks for those
 * at any depth and reads each as one line. Inside one, whitespace is not
 * literal: ODF collapses it like HTML does and spells out what must survive —
 * `text:s` for a run of spaces, `text:tab`, `text:line-break`.
 *
 * Notes and comments are left out, for the reason the `.doc` reader gives:
 * spoken mid-sentence they interrupt the text they annotate.
 */

const PARAGRAPHS = new Set(["text:p", "text:h"]);

const SKIPPED = new Set([
    "text:note",
    "office:annotation",
    "office:annotation-end",
    "text:tracked-changes",
    "text:sequence-decls",
]);

function inlineText(node: Node): string {
    let text = "";

    for (let index = 0; index < node.childNodes.length; index += 1) {
        const child = node.childNodes[index];

        if (child.nodeType === 3) {
            // Collapsed the way ODF says a consumer must, since the
            // significant spaces are the ones written as `text:s`.
            text += (child.nodeValue ?? "").replace(/[\t\n\r ]+/gu, " ");
            continue;
        }

        if (child.nodeType !== 1) {
            continue;
        }

        const element = child as Element;

        switch (element.nodeName) {
            case "text:s":
                text += " ".repeat(Math.max(1, Number(element.getAttribute("text:c") ?? "1") || 1));
                break;
            case "text:tab":
                text += "\t";
                break;
            case "text:line-break":
                text += "\n";
                break;
            default:
                if (!SKIPPED.has(element.nodeName)) {
                    text += inlineText(element);
                }
        }
    }

    return text;
}

function collectParagraphs(node: Node, lines: string[]): void {
    for (let index = 0; index < node.childNodes.length; index += 1) {
        const child = node.childNodes[index];

        if (child.nodeType !== 1 || SKIPPED.has(child.nodeName)) {
            continue;
        }

        if (PARAGRAPHS.has(child.nodeName)) {
            lines.push(inlineText(child));
        } else {
            collectParagraphs(child, lines);
        }
    }
}

/** `null` when the package has no readable `content.xml`. */
export function readOpenDocumentText(pkg: XmlPackage): string | null {
    const content = readEntryText(pkg, "content.xml");
    const root = content === null ? null : parseXml(content);

    if (root === null) {
        return null;
    }

    const lines: string[] = [];

    collectParagraphs(root, lines);

    return lines.join("\n");
}
