import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

import { bytesToDataUri } from "@/modules/tools/domain/base64";
import type { EmbeddedImage } from "../types";
import { MAX_PDF_IMAGE_BYTES } from "./constants";

/**
 * The three things every Open XML reader in this module needs: the members of
 * the ZIP, the XML inside one of them, and the relationship table that turns an
 * `r:embed="rId4"` into a path under `media/`.
 *
 * `@xmldom/xmldom` rather than the platform's `DOMParser`, on purpose. Bun and
 * Node have no global `DOMParser` at all, so the domain layer could not be
 * tested without one — and a parser that resolves to the platform in a browser
 * and to a shim on a server is the exact shape the HTML / Markdown converter's
 * case study warns about. One parser everywhere means one behaviour everywhere.
 */

export type OoxmlPackage = {
    readonly entries: ReadonlyMap<string, Uint8Array>;
    readonly names: readonly string[];
};

/** `null` when the bytes are not a readable ZIP at all. */
export function readPackage(bytes: Uint8Array): OoxmlPackage | null {
    try {
        const unzipped = unzipSync(bytes);
        const entries = new Map<string, Uint8Array>(Object.entries(unzipped));

        return { entries, names: [...entries.keys()] };
    } catch {
        // fflate throws on a truncated archive, an unsupported compression
        // method, and bytes that were never a ZIP. All three are the same
        // answer to the reader, and none of them is improved by the message.
        return null;
    }
}

const TEXT_DECODER = new TextDecoder("utf-8");

export function readEntryText(pkg: OoxmlPackage, path: string): string | null {
    const bytes = pkg.entries.get(path);

    return bytes === undefined ? null : TEXT_DECODER.decode(bytes);
}

/** `null` when the part is missing or is not well-formed XML. */
export function readEntryXml(pkg: OoxmlPackage, path: string): Element | null {
    const text = readEntryText(pkg, path);

    if (text === null) {
        return null;
    }

    return parseXml(text);
}

export function parseXml(text: string): Element | null {
    let failed = false;

    // xmldom reports a fatal parse through a handler rather than by throwing,
    // and warns loudly on stderr otherwise. Both are silenced here: this layer
    // has nowhere to log, and a warning about somebody else's document is not
    // the reader's problem.
    const parser = new DOMParser({
        onError: (level) => {
            if (level === "fatalError" || level === "error") {
                failed = true;
            }
        },
    });

    try {
        const document = parser.parseFromString(text, "text/xml");
        const root = document.documentElement;

        return failed || root === null ? null : (root as unknown as Element);
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------- walk --- */

/**
 * Direct children with a given qualified name — `a:p`, `w:tbl`.
 *
 * Qualified rather than local, because Open XML reuses local names across
 * namespaces: `a:tbl` inside a slide and `w:tbl` inside a document are
 * different elements with different children, and matching on `tbl` alone
 * would read one as the other.
 */
export function childrenNamed(element: Element, name: string): readonly Element[] {
    const matches: Element[] = [];

    for (let index = 0; index < element.childNodes.length; index += 1) {
        const node = element.childNodes[index];

        if (node.nodeType === 1 && (node as Element).nodeName === name) {
            matches.push(node as Element);
        }
    }

    return matches;
}

export function firstChildNamed(element: Element, name: string): Element | null {
    return childrenNamed(element, name)[0] ?? null;
}

export function descendantsNamed(element: Element, name: string): readonly Element[] {
    return [...element.getElementsByTagName(name)] as unknown as Element[];
}

/** Follows a path of qualified names, one level at a time. */
export function childPath(element: Element | null, ...names: readonly string[]): Element | null {
    let current: Element | null = element;

    for (const name of names) {
        if (current === null) {
            return null;
        }

        current = firstChildNamed(current, name);
    }

    return current;
}

export function attribute(element: Element | null, name: string): string | null {
    return element?.getAttribute(name) ?? null;
}

export function numericAttribute(element: Element | null, name: string): number | null {
    const raw = attribute(element, name);

    if (raw === null || raw.trim().length === 0) {
        return null;
    }

    const value = Number(raw);

    return Number.isFinite(value) ? value : null;
}

/* ---------------------------------------------------------- relationships --- */

export type Relationships = ReadonlyMap<string, { readonly target: string; readonly type: string }>;

/**
 * The `_rels` file that sits beside a part, keyed by relationship id.
 *
 * A part at `ppt/slides/slide1.xml` keeps its table at
 * `ppt/slides/_rels/slide1.xml.rels`, and every `r:embed` and `r:id` inside the
 * slide is a key into it.
 */
export function relationshipPathFor(partPath: string): string {
    const slash = partPath.lastIndexOf("/");
    const directory = slash < 0 ? "" : partPath.slice(0, slash + 1);
    const file = slash < 0 ? partPath : partPath.slice(slash + 1);

    return `${directory}_rels/${file}.rels`;
}

export function readRelationships(pkg: OoxmlPackage, partPath: string): Relationships {
    const root = readEntryXml(pkg, relationshipPathFor(partPath));
    const table = new Map<string, { target: string; type: string }>();

    if (root === null) {
        return table;
    }

    for (const relationship of descendantsNamed(root, "Relationship")) {
        const id = attribute(relationship, "Id");
        const target = attribute(relationship, "Target");

        if (id === null || target === null) {
            continue;
        }

        table.set(id, { target, type: attribute(relationship, "Type") ?? "" });
    }

    return table;
}

/**
 * Resolves a relationship target against the part that referenced it.
 *
 * Targets are relative — `../media/image1.png` from inside `ppt/slides/` — and
 * a `..` that walked above the package root would be an escape rather than a
 * path, so it is refused instead of clamped.
 */
export function resolvePackagePath(fromPart: string, target: string): string | null {
    if (target.startsWith("/")) {
        return target.slice(1);
    }

    const slash = fromPart.lastIndexOf("/");
    const segments = slash < 0 ? [] : fromPart.slice(0, slash).split("/");

    for (const segment of target.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }

        if (segment === "..") {
            if (segments.length === 0) {
                return null;
            }

            segments.pop();

            continue;
        }

        segments.push(segment);
    }

    return segments.length === 0 ? null : segments.join("/");
}

/* ----------------------------------------------------------------- images --- */

/**
 * The only two raster formats PDF itself stores.
 *
 * Everything else a document can carry — GIF, WMF, EMF, SVG, TIFF — would have
 * to be transcoded, which needs a canvas, which is not something a pure
 * document reader has. So they are dropped by name, and the name reaches the
 * reader through `PdfConversionNotes.droppedImageTypes`.
 */
const EMBEDDABLE_IMAGE_TYPES: Readonly<Record<string, string>> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
};

export function imageMediaTypeOf(path: string): string | null {
    const dot = path.lastIndexOf(".");
    const extension = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();

    return EMBEDDABLE_IMAGE_TYPES[extension] ?? null;
}

/** The extension as written, for a drop notice — `emf`, `svg`, `gif`. */
export function imageExtensionOf(path: string): string {
    const dot = path.lastIndexOf(".");

    return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

export type ImageEmbedResult =
    | { readonly ok: true; readonly image: EmbeddedImage }
    | { readonly ok: false; readonly droppedType: string };

/**
 * A package member turned into something the renderer can place, or a named
 * reason it could not be.
 *
 * The size ceiling is here rather than at the call site because every reader
 * would otherwise have to remember it, and a four-megabyte scan embedded in a
 * ten-megabyte deck is the same mistake whichever format it arrived in.
 */
export function embedPackageImage(pkg: OoxmlPackage, path: string): ImageEmbedResult {
    const bytes = pkg.entries.get(path);

    if (bytes === undefined) {
        return { ok: false, droppedType: imageExtensionOf(path) || "unknown" };
    }

    if (bytes.length > MAX_PDF_IMAGE_BYTES) {
        return { ok: false, droppedType: "oversize" };
    }

    const mediaType = imageMediaTypeOf(path);

    if (mediaType === null) {
        return { ok: false, droppedType: imageExtensionOf(path) || "unknown" };
    }

    return {
        ok: true,
        image: {
            dataUri: bytesToDataUri(bytes, mediaType),
            widthPx: null,
            heightPx: null,
            alt: null,
        },
    };
}
