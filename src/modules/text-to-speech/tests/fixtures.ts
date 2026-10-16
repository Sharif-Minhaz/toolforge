import { zipSync } from "fflate";

/**
 * Documents built byte by byte, for the reason `tools/tests/office-fixtures.ts`
 * gives: minimal, readable in a diff, and malformable on purpose.
 *
 * The compound-file writer and the Word builder are the half of this module's
 * verification that `bun test` can reach. The other half — that the readers
 * agree with what Word, LibreOffice and SheetJS make of real files — was done
 * out of band and is recorded in `docs/case-studies/text-to-speech.md`.
 */

const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4_096;
const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const FAT_SECTOR = 0xfffffffd;
const NO_STREAM = 0xffffffff;

export type CompoundStream = { readonly name: string; readonly data: Uint8Array };

function writeName(view: DataView, offset: number, name: string): void {
    for (let index = 0; index < name.length; index += 1) {
        view.setUint16(offset + index * 2, name.charCodeAt(index), true);
    }

    view.setUint16(offset + 0x40, (name.length + 1) * 2, true);
}

/**
 * A version 3 compound file holding up to three streams in its root storage.
 * Streams under 4,096 bytes go to the mini stream and the rest to ordinary
 * sectors — the two paths a reader has to get right.
 */
export function buildCompoundFile(streams: readonly CompoundStream[]): Uint8Array {
    if (streams.length > 3) {
        throw new Error("fixture holds at most three streams");
    }

    const small = streams.filter((stream) => stream.data.length < MINI_CUTOFF);
    const miniStarts = new Map<string, number>();
    const miniFat: number[] = [];

    for (const stream of small) {
        const count = Math.max(1, Math.ceil(stream.data.length / MINI_SECTOR));

        miniStarts.set(stream.name, miniFat.length);

        for (let index = 0; index < count; index += 1) {
            miniFat.push(index === count - 1 ? END_OF_CHAIN : miniFat.length + 1);
        }
    }

    const miniStreamBytes = miniFat.length * MINI_SECTOR;
    const miniStreamSectors = Math.ceil(miniStreamBytes / SECTOR);

    // Sector 0 is the FAT, 1 the directory, 2 the mini FAT, then the mini
    // stream, then every large stream in turn.
    const fat: number[] = [FAT_SECTOR, END_OF_CHAIN, END_OF_CHAIN];
    const miniStreamStart = miniStreamSectors > 0 ? fat.length : END_OF_CHAIN;

    for (let index = 0; index < miniStreamSectors; index += 1) {
        fat.push(index === miniStreamSectors - 1 ? END_OF_CHAIN : fat.length + 1);
    }

    const largeStarts = new Map<string, number>();

    for (const stream of streams.filter((candidate) => candidate.data.length >= MINI_CUTOFF)) {
        const count = Math.ceil(stream.data.length / SECTOR);

        largeStarts.set(stream.name, fat.length);

        for (let index = 0; index < count; index += 1) {
            fat.push(index === count - 1 ? END_OF_CHAIN : fat.length + 1);
        }
    }

    if (fat.length > SECTOR / 4) {
        throw new Error("fixture fits one FAT sector");
    }

    const bytes = new Uint8Array(SECTOR * (fat.length + 1));
    const view = new DataView(bytes.buffer);
    const sectorAt = (sector: number) => (sector + 1) * SECTOR;

    // Header.
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    view.setUint16(0x18, 0x003e, true);
    view.setUint16(0x1a, 3, true);
    view.setUint16(0x1c, 0xfffe, true);
    view.setUint16(0x1e, 9, true);
    view.setUint16(0x20, 6, true);
    view.setUint32(0x2c, 1, true);
    view.setUint32(0x30, 1, true);
    view.setUint32(0x38, MINI_CUTOFF, true);
    view.setUint32(0x3c, miniFat.length > 0 ? 2 : END_OF_CHAIN, true);
    view.setUint32(0x40, miniFat.length > 0 ? 1 : 0, true);
    view.setUint32(0x44, END_OF_CHAIN, true);
    view.setUint32(0x4c, 0, true);

    for (let index = 1; index < 109; index += 1) {
        view.setUint32(0x4c + index * 4, FREE_SECTOR, true);
    }

    // FAT.
    for (let index = 0; index < SECTOR / 4; index += 1) {
        view.setUint32(sectorAt(0) + index * 4, fat[index] ?? FREE_SECTOR, true);
    }

    // Mini FAT.
    for (let index = 0; index < SECTOR / 4; index += 1) {
        view.setUint32(sectorAt(2) + index * 4, miniFat[index] ?? FREE_SECTOR, true);
    }

    // Directory: the root, then the streams as a chain of right siblings.
    const directory = sectorAt(1);

    for (let entry = 0; entry < 4; entry += 1) {
        const offset = directory + entry * 128;

        view.setUint32(offset + 0x44, NO_STREAM, true);
        view.setUint32(offset + 0x48, NO_STREAM, true);
        view.setUint32(offset + 0x4c, NO_STREAM, true);
    }

    writeName(view, directory, "Root Entry");
    view.setUint8(directory + 0x42, 5);
    view.setUint32(directory + 0x4c, streams.length > 0 ? 1 : NO_STREAM, true);
    view.setUint32(directory + 0x74, miniStreamStart, true);
    view.setUint32(directory + 0x78, miniStreamBytes, true);

    streams.forEach((stream, index) => {
        const offset = directory + (index + 1) * 128;
        const start = miniStarts.get(stream.name) ?? largeStarts.get(stream.name) ?? END_OF_CHAIN;

        writeName(view, offset, stream.name);
        view.setUint8(offset + 0x42, 2);
        view.setUint32(offset + 0x48, index + 2 <= streams.length ? index + 2 : NO_STREAM, true);
        view.setUint32(offset + 0x74, start, true);
        view.setUint32(offset + 0x78, stream.data.length, true);

        const mini = miniStarts.get(stream.name);
        const large = largeStarts.get(stream.name);

        if (mini !== undefined && miniStreamStart !== END_OF_CHAIN) {
            bytes.set(stream.data, sectorAt(miniStreamStart) + mini * MINI_SECTOR);
        } else if (large !== undefined) {
            bytes.set(stream.data, sectorAt(large));
        }
    });

    return bytes;
}

/* ------------------------------------------------------------------- doc --- */

const CP1252_BYTES: ReadonlyMap<string, number> = (() => {
    const decoder = new TextDecoder("windows-1252");
    const table = new Map<string, number>();

    for (let byte = 0; byte < 256; byte += 1) {
        table.set(decoder.decode(new Uint8Array([byte])), byte);
    }

    return table;
})();

export type WordPiece = {
    readonly text: string;
    /** 8-bit Windows-1252 rather than UTF-16. */
    readonly compressed: boolean;
};

export type WordDocumentOptions = {
    readonly pieces: readonly WordPiece[];
    /** Characters of the main body; defaults to all of them. */
    readonly mainLength?: number;
    /** Where each piece's bytes sit in the stream, as an order over `pieces`. */
    readonly fileOrder?: readonly number[];
    readonly nFib?: number;
    readonly encrypted?: boolean;
    /** A property run ahead of the piece table, which a reader must skip. */
    readonly withPropertyRun?: boolean;
};

const TEXT_START = 0x400;

function encodePiece(piece: WordPiece): Uint8Array {
    if (!piece.compressed) {
        const out = new Uint8Array(piece.text.length * 2);
        const view = new DataView(out.buffer);

        for (let index = 0; index < piece.text.length; index += 1) {
            view.setUint16(index * 2, piece.text.charCodeAt(index), true);
        }

        return out;
    }

    return Uint8Array.from([...piece.text], (character) => {
        const byte = CP1252_BYTES.get(character);

        if (byte === undefined) {
            throw new Error(`not in Windows-1252: ${character}`);
        }

        return byte;
    });
}

/** A Word 97 document: `WordDocument` and `1Table`, wrapped in a compound file. */
export function buildWordDocument(options: WordDocumentOptions): Uint8Array {
    const { pieces } = options;
    const order = options.fileOrder ?? pieces.map((_, index) => index);
    const encoded = pieces.map(encodePiece);
    const offsets = new Array<number>(pieces.length);
    let cursor = TEXT_START;

    for (const index of order) {
        offsets[index] = cursor;
        cursor += encoded[index].length;
    }

    // Large enough to live in ordinary sectors, as a real one always does.
    const document = new Uint8Array(Math.max(cursor, 4_608));
    const fib = new DataView(document.buffer);

    for (const index of order) {
        document.set(encoded[index], offsets[index]);
    }

    const totalCharacters = pieces.reduce((sum, piece) => sum + piece.text.length, 0);

    fib.setUint16(0, 0xa5ec, true);
    fib.setUint16(2, options.nFib ?? 0x00c1, true);
    fib.setUint16(0x0a, 0x0200 | (options.encrypted ? 0x0100 : 0), true);
    fib.setUint16(0x20, 14, true);
    fib.setUint16(0x3e, 22, true);
    fib.setInt32(0x40 + 0x0c, options.mainLength ?? totalCharacters, true);
    fib.setUint16(0x98, 93, true);

    // The table stream: an optional property run, then the piece table.
    const pieceTableLength = 4 * (pieces.length + 1) + 8 * pieces.length;
    const prefix = options.withPropertyRun ? 5 : 0;
    const table = new Uint8Array(prefix + 5 + pieceTableLength);
    const tableView = new DataView(table.buffer);

    if (options.withPropertyRun) {
        tableView.setUint8(0, 0x01);
        tableView.setInt16(1, 2, true);
    }

    tableView.setUint8(prefix, 0x02);
    tableView.setUint32(prefix + 1, pieceTableLength, true);

    let position = 0;

    pieces.forEach((piece, index) => {
        tableView.setUint32(prefix + 5 + index * 4, position, true);
        position += piece.text.length;

        const descriptor = prefix + 5 + (pieces.length + 1) * 4 + index * 8;
        const fc = piece.compressed ? (offsets[index] * 2) | 0x40000000 : offsets[index];

        tableView.setUint32(descriptor + 2, fc >>> 0, true);
    });

    tableView.setUint32(prefix + 5 + pieces.length * 4, position, true);

    fib.setUint32(0x9a + 33 * 8, 0, true);
    fib.setUint32(0x9a + 33 * 8 + 4, table.length, true);

    return buildCompoundFile([
        { name: "WordDocument", data: document },
        { name: "1Table", data: table },
    ]);
}

/* ------------------------------------------------------------------- odt --- */

const ODF_NAMESPACES =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"';

/** An OpenDocument package whose body is `bodyXml`, verbatim. */
export function buildOpenDocument(
    bodyXml: string,
    mimetype = "application/vnd.oasis.opendocument.text",
): Uint8Array {
    const encoder = new TextEncoder();
    const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ODF_NAMESPACES}><office:body><office:text>${bodyXml}</office:text></office:body></office:document-content>`;

    return zipSync(
        {
            mimetype: [encoder.encode(mimetype), { level: 0 }],
            "content.xml": encoder.encode(content),
        },
        { mtime: new Date(Date.UTC(2026, 0, 1)) },
    );
}

/* ------------------------------------------------------------------- pdf --- */

/**
 * A one-page PDF that draws `text` in Helvetica. Offsets in the cross-reference
 * table are computed, so the file is valid rather than merely recoverable.
 */
export function buildPdf(text: string): Uint8Array {
    const escaped = text.replace(/[\\()]/gu, (character) => `\\${character}`);
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

    let body = "%PDF-1.4\n";
    const offsets: number[] = [];

    objects.forEach((object, index) => {
        offsets.push(body.length);
        body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xref = body.length;

    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    return new TextEncoder().encode(body);
}
