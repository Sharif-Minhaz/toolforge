/**
 * A reader for the OLE2 compound file every pre-2007 Office document lives in
 * — enough of [MS-CFB] to pull one named stream out of the root storage.
 *
 * Written rather than depended on. The reference implementation that ships in
 * this repository, SheetJS's, is exported typed as `any`; the format is small,
 * fully specified and read-only here, and the only consumer of what comes out
 * is this tool's own text extractor. Cross-checked against SheetJS's reader on
 * LibreOffice-written `.doc` and `.xls` files — see the case study.
 *
 * Every offset is bounds-checked and every chain is cycle-checked, because the
 * input is a file somebody picked and a sector chain that loops back on itself
 * is two bytes of malice away. Anything malformed is `null`: the caller has one
 * answer for "this is not a document I can read", whatever the reason.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const NO_STREAM = 0xffffffff;

const HEADER_DIFAT_ENTRIES = 109;
const DIRECTORY_ENTRY_BYTES = 128;

const OBJECT_STREAM = 2;
const OBJECT_ROOT = 5;

type DirectoryEntry = {
    readonly name: string;
    readonly type: number;
    readonly left: number;
    readonly right: number;
    readonly child: number;
    readonly start: number;
    readonly size: number;
};

export type CompoundFile = {
    /** Names of the streams directly inside the root storage. */
    readonly streamNames: readonly string[];
    /** `null` when the stream is absent or its chain is broken. */
    readStream(name: string): Uint8Array | null;
};

function hasSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 512 && SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function openCompoundFile(bytes: Uint8Array): CompoundFile | null {
    if (!hasSignature(bytes)) {
        return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sectorShift = view.getUint16(0x1e, true);
    const miniSectorShift = view.getUint16(0x20, true);

    // Version 3 files use 512-byte sectors and version 4 files 4096; nothing
    // else has ever been written, and a shift outside that is a corrupt header.
    if ((sectorShift !== 9 && sectorShift !== 12) || miniSectorShift !== 6) {
        return null;
    }

    const sectorSize = 1 << sectorShift;
    const entriesPerSector = sectorSize / 4;
    const sectorCount = Math.floor(bytes.length / sectorSize) - 1;

    const sectorOffset = (sector: number): number | null => {
        if (sector >= sectorCount) {
            return null;
        }

        return (sector + 1) * sectorSize;
    };

    const readU32 = (offset: number): number | null =>
        offset >= 0 && offset + 4 <= bytes.length ? view.getUint32(offset, true) : null;

    // ── The FAT, located through the DIFAT ─────────────────────────────────

    const fatSectors: number[] = [];

    for (let index = 0; index < HEADER_DIFAT_ENTRIES; index += 1) {
        const sector = view.getUint32(0x4c + index * 4, true);

        if (sector === FREE_SECTOR || sector === END_OF_CHAIN) {
            break;
        }

        fatSectors.push(sector);
    }

    let difatSector = view.getUint32(0x44, true);
    const visitedDifat = new Set<number>();

    while (difatSector !== END_OF_CHAIN && difatSector !== FREE_SECTOR) {
        const offset = sectorOffset(difatSector);

        if (offset === null || visitedDifat.has(difatSector)) {
            return null;
        }

        visitedDifat.add(difatSector);

        for (let index = 0; index < entriesPerSector - 1; index += 1) {
            const sector = view.getUint32(offset + index * 4, true);

            if (sector !== FREE_SECTOR && sector !== END_OF_CHAIN) {
                fatSectors.push(sector);
            }
        }

        difatSector = view.getUint32(offset + (entriesPerSector - 1) * 4, true);
    }

    const fat: number[] = [];

    for (const sector of fatSectors) {
        const offset = sectorOffset(sector);

        if (offset === null) {
            return null;
        }

        for (let index = 0; index < entriesPerSector; index += 1) {
            fat.push(view.getUint32(offset + index * 4, true));
        }
    }

    /** Sector ids of a chain, or `null` if it leaves the file, loops, or runs on. */
    const followChain = (table: readonly number[], start: number): number[] | null => {
        const chain: number[] = [];
        const seen = new Set<number>();
        let current = start;

        while (current !== END_OF_CHAIN) {
            if (current >= table.length || seen.has(current)) {
                return null;
            }

            seen.add(current);
            chain.push(current);
            current = table[current];
        }

        return chain;
    };

    const readChain = (start: number, size: number): Uint8Array | null => {
        const chain = followChain(fat, start);

        if (chain === null || chain.length * sectorSize < size) {
            return null;
        }

        const out = new Uint8Array(size);
        let written = 0;

        for (const sector of chain) {
            const offset = sectorOffset(sector);

            if (offset === null) {
                return null;
            }

            const take = Math.min(sectorSize, size - written);

            out.set(bytes.subarray(offset, offset + take), written);
            written += take;

            if (written >= size) {
                break;
            }
        }

        return out;
    };

    // ── The directory ──────────────────────────────────────────────────────

    const directoryChain = followChain(fat, view.getUint32(0x30, true));

    if (directoryChain === null) {
        return null;
    }

    const directory = readChain(view.getUint32(0x30, true), directoryChain.length * sectorSize);

    if (directory === null) {
        return null;
    }

    const directoryView = new DataView(directory.buffer);
    const entries: DirectoryEntry[] = [];

    for (
        let offset = 0;
        offset + DIRECTORY_ENTRY_BYTES <= directory.length;
        offset += DIRECTORY_ENTRY_BYTES
    ) {
        const nameBytes = Math.min(64, directoryView.getUint16(offset + 0x40, true));
        // The length counts the terminating NUL, which is not part of the name.
        const nameUnits = Math.max(0, nameBytes / 2 - 1);
        let name = "";

        for (let unit = 0; unit < nameUnits; unit += 1) {
            name += String.fromCharCode(directoryView.getUint16(offset + unit * 2, true));
        }

        entries.push({
            name,
            type: directoryView.getUint8(offset + 0x42),
            left: directoryView.getUint32(offset + 0x44, true),
            right: directoryView.getUint32(offset + 0x48, true),
            child: directoryView.getUint32(offset + 0x4c, true),
            start: directoryView.getUint32(offset + 0x74, true),
            // The high half is reserved in version 3 files and holds junk in
            // some writers; no stream this reads comes near four gigabytes.
            size: directoryView.getUint32(offset + 0x78, true),
        });
    }

    const root = entries[0];

    if (root === undefined || root.type !== OBJECT_ROOT) {
        return null;
    }

    // ── The mini stream, for streams under the cutoff ──────────────────────

    const miniCutoff = view.getUint32(0x38, true);
    const miniStream =
        root.start === END_OF_CHAIN ? new Uint8Array(0) : readChain(root.start, root.size);
    const miniFatStart = view.getUint32(0x3c, true);
    const miniFat: number[] = [];

    if (miniFatStart !== END_OF_CHAIN && miniFatStart !== FREE_SECTOR) {
        const chain = followChain(fat, miniFatStart);

        if (chain === null) {
            return null;
        }

        for (const sector of chain) {
            const offset = sectorOffset(sector);

            if (offset === null) {
                return null;
            }

            for (let index = 0; index < entriesPerSector; index += 1) {
                const value = readU32(offset + index * 4);

                if (value === null) {
                    return null;
                }

                miniFat.push(value);
            }
        }
    }

    const readMiniChain = (start: number, size: number): Uint8Array | null => {
        const chain = followChain(miniFat, start);
        const miniSize = 1 << miniSectorShift;

        if (miniStream === null || chain === null || chain.length * miniSize < size) {
            return null;
        }

        const out = new Uint8Array(size);
        let written = 0;

        for (const sector of chain) {
            const offset = sector * miniSize;

            if (offset + miniSize > miniStream.length) {
                return null;
            }

            const take = Math.min(miniSize, size - written);

            out.set(miniStream.subarray(offset, offset + take), written);
            written += take;

            if (written >= size) {
                break;
            }
        }

        return out;
    };

    // ── The root storage's own children ────────────────────────────────────

    // Walked as the tree it is, from the root's child through left and right
    // siblings, rather than by scanning every entry for a name: an embedded
    // object keeps a whole document of its own in a sub-storage, with its own
    // `WordDocument` stream, and a flat scan could return that one instead.
    const rootStreams = new Map<string, DirectoryEntry>();
    const pending = [root.child];
    const visited = new Set<number>();

    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
        if (id === NO_STREAM || visited.has(id)) {
            continue;
        }

        const entry = entries[id];

        if (entry === undefined) {
            return null;
        }

        visited.add(id);
        pending.push(entry.left, entry.right);

        if (entry.type === OBJECT_STREAM) {
            rootStreams.set(entry.name, entry);
        }
    }

    return {
        streamNames: [...rootStreams.keys()],
        readStream(name) {
            const entry = rootStreams.get(name);

            if (entry === undefined) {
                return null;
            }

            if (entry.size === 0) {
                return new Uint8Array(0);
            }

            return entry.size < miniCutoff
                ? readMiniChain(entry.start, entry.size)
                : readChain(entry.start, entry.size);
        },
    };
}
