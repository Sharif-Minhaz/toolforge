import mammoth from "mammoth";

import type { DocBlock } from "../types";
import { firstHeadingText } from "./blocks";
import { readHtml, type HtmlReadOptions } from "./read-html";

/**
 * Word in, blocks out, by way of HTML.
 *
 * Mammoth is depended on rather than written, and this is the clearest case in
 * the module for decision tree 45. A `.docx` is not one format: it is numbering
 * definitions, a style hierarchy with inheritance, a relationship graph, and
 * fifteen years of what Word actually emits rather than what the ECMA standard
 * says it should. Getting a heading level right means resolving a style's
 * ancestors; getting a numbered list right means reading `numbering.xml` and
 * tracking a counter per level per instance. Every one of those is a defect
 * somebody would find in their own CV.
 *
 * What it produces is HTML, which is already this module's own seam — so a
 * `.docx` and a saved web page take exactly the same path from here on, and a
 * table nested in a list cell behaves the same in both.
 *
 * **How the bytes are handed over is not the same on both sides**, and this is
 * the trap the HTML / Markdown converter's case study warned would come round
 * again. Mammoth's `browser` field swaps its unzip module, and the two
 * implementations accept different keys:
 *
 * | Where               | Module                | Accepts                     |
 * | ------------------- | --------------------- | --------------------------- |
 * | Browser             | `browser/unzip.js`    | `arrayBuffer` only          |
 * | Server / `bun test` | `lib/unzip.js`        | `path`, `buffer`, `file`    |
 *
 * Neither throws a useful error for the other's key — both reject with
 * `Could not find file in options`, which says nothing about which build is
 * running. So both keys are passed. That makes the call correct wherever it
 * resolves, and turns "which build did the bundler pick" from something this
 * code has to know into something it does not.
 */

export type DocxReadResult = {
    readonly blocks: readonly DocBlock[];
    readonly title: string | null;
    readonly droppedImageTypes: readonly string[];
    /** True when the package parsed but Mammoth found nothing it could convert. */
    readonly empty: boolean;
};

/**
 * `null` when the package is not a Word document Mammoth can read at all.
 *
 * Distinguished from an empty result on purpose: a file that cannot be opened
 * and a file that opens onto nothing are two different things to be told, and
 * only one of them is fixed by a different file.
 */
export async function readDocx(
    bytes: Uint8Array,
    options: HtmlReadOptions,
): Promise<DocxReadResult | null> {
    let html: string;

    try {
        // Mammoth's default image handler already inlines a picture as a
        // base64 `data:` URI, which is exactly the shape `read-html.ts`
        // accepts — and the shape it refuses for anything that is not a PNG or
        // a JPEG, so an EMF drawn in Word is dropped by name rather than
        // embedded as bytes no PDF reader can draw.
        const buffer = toArrayBuffer(bytes);
        const input: Parameters<typeof mammoth.convertToHtml>[0] = { arrayBuffer: buffer };

        // The published type is a union of "browser input" and "Node input",
        // so it cannot say *both* — which is exactly what a call that has to
        // work wherever it resolves needs to say. The second key is attached
        // rather than declared, which keeps the assignment honest without an
        // assertion over the whole object.
        Object.assign(input, { buffer });

        const converted = await mammoth.convertToHtml(input);

        html = converted.value;
    } catch {
        // Mammoth throws on a package with no `word/document.xml`, on a
        // corrupt ZIP, and on XML it cannot parse. All three are the same
        // answer here, and none is improved by the library's own wording.
        return null;
    }

    const { blocks, droppedImageTypes } = readHtml(html, options);

    return {
        blocks,
        title: firstHeadingText(blocks),
        droppedImageTypes,
        empty: blocks.length === 0,
    };
}

/**
 * A view over exactly this array's bytes.
 *
 * `bytes.buffer` alone is wrong whenever the array is a window onto a larger
 * buffer — which is what `fflate` hands back for a package member, and what a
 * `File` read into a pooled buffer can be. Slicing is a copy, and a copy of the
 * right bytes beats a free reference to the wrong ones.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.length);

    copy.set(bytes);

    return copy.buffer;
}
