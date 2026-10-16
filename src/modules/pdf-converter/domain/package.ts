import { bytesToDataUri } from "@/modules/tools/domain/base64";
import {
    attribute,
    descendantsNamed,
    readEntryXml,
    type XmlPackage,
} from "@/modules/tools/domain/xml-package";
import type { EmbeddedImage } from "../types";
import { MAX_PDF_IMAGE_BYTES } from "./constants";

/**
 * What every Open XML reader in this module needs beyond the ZIP and its XML,
 * which live in `tools/domain/xml-package.ts`: the relationship table that
 * turns an `r:embed="rId4"` into a path under `media/`, and the images it
 * points at.
 */

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

export function readRelationships(pkg: XmlPackage, partPath: string): Relationships {
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
export function embedPackageImage(pkg: XmlPackage, path: string): ImageEmbedResult {
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
