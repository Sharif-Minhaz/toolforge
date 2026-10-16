import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

/**
 * Reading a ZIP of XML parts — every Open XML file, and every OpenDocument one.
 *
 * Lifted out of the PDF Converter's `package.ts` when Text to Speech needed to
 * read `.odt` files: the members of the ZIP, the XML inside one of them, and a
 * walk over it. What is specific to Open XML — the relationship table that turns
 * an `r:embed="rId4"` into a path under `media/` — stayed behind.
 *
 * `@xmldom/xmldom` rather than the platform's `DOMParser`, on purpose. Bun and
 * Node have no global `DOMParser` at all, so the domain layer could not be
 * tested without one — and a parser that resolves to the platform in a browser
 * and to a shim on a server is the exact shape the HTML / Markdown converter's
 * case study warns about. One parser everywhere means one behaviour everywhere.
 */

export type XmlPackage = {
    readonly entries: ReadonlyMap<string, Uint8Array>;
    readonly names: readonly string[];
};

/** `null` when the bytes are not a readable ZIP at all. */
export function readPackage(bytes: Uint8Array): XmlPackage | null {
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

export function readEntryText(pkg: XmlPackage, path: string): string | null {
    const bytes = pkg.entries.get(path);

    return bytes === undefined ? null : TEXT_DECODER.decode(bytes);
}

/** `null` when the part is missing or is not well-formed XML. */
export function readEntryXml(pkg: XmlPackage, path: string): Element | null {
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
