"use client";

import { saveBlob } from "@/modules/tools/domain/file-saver";
import { FALLBACK_FILENAME } from "../domain/constants";

/**
 * Getting bytes off the reader's disk and back onto it.
 *
 * Two routes, and which one is taken is a fact about the browser rather than a
 * setting. Where the File System Access API exists, a file opened through it
 * comes with a handle and Save writes straight back over the original — which
 * is the whole point of an editor. Where it does not, Save is a download, and
 * the reader ends up with `firmware (1).rom` in their downloads folder. The
 * status bar says which of the two happened; nothing here decides silently.
 *
 * The API is feature-detected in the handler rather than during render. Reading
 * it while rendering would be a capability probe on the client that the server
 * cannot make, and hydration is exactly what that breaks.
 */

/** The slice of the File System Access API this uses, and only that slice. */
type SaveFilePickerOptions = {
    readonly suggestedName?: string;
    readonly types?: readonly {
        readonly description: string;
        readonly accept: Record<string, readonly string[]>;
    }[];
};

type FilePickers = {
    showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
};

export type OpenedFile = {
    readonly bytes: Uint8Array;
    readonly name: string;
    /** Present only when the browser gave us one to write back through. */
    readonly handle: FileSystemFileHandle | null;
};

function pickers(): FilePickers {
    return globalThis as unknown as FilePickers;
}

export function supportsFileSystemAccess(): boolean {
    return typeof pickers().showSaveFilePicker === "function";
}

/**
 * `null` for a cancelled picker, which is not a failure and must not be
 * reported as one. Anything else is thrown and the caller names it.
 */
export async function pickFileToOpen(): Promise<OpenedFile | null> {
    const open = pickers().showOpenFilePicker;

    if (open === undefined) {
        return null;
    }

    const [handle] = await open({ multiple: false });

    if (handle === undefined) {
        return null;
    }

    return readHandle(handle);
}

export async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
    const file = await handle.getFile();

    return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle };
}

/** A file that arrived by drop or through an `<input type="file">`. */
export async function readFile(file: File): Promise<OpenedFile> {
    return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle: null };
}

/** True when the bytes reached the original file. */
export async function writeThroughHandle(
    handle: FileSystemFileHandle,
    bytes: Uint8Array,
): Promise<void> {
    const writable = await handle.createWritable();

    try {
        // A fresh `ArrayBuffer` rather than the view, so a subarray of a larger
        // buffer cannot write more than it was asked to.
        await writable.write(bytes.slice().buffer);
    } finally {
        await writable.close();
    }
}

/**
 * The Save As picker, or `null` when the browser has none. A cancelled picker
 * throws `AbortError`, which the caller reads as "nothing happened".
 */
export async function pickFileToSave(suggestedName: string): Promise<FileSystemFileHandle | null> {
    const save = pickers().showSaveFilePicker;

    if (save === undefined) {
        return null;
    }

    return save({
        suggestedName: suggestedName || FALLBACK_FILENAME,
        types: [{ description: "Binary", accept: { "application/octet-stream": [".bin"] } }],
    });
}

/** True when a picker was dismissed rather than failing. */
export function isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

/** The fallback: hand the browser a blob and let it land in Downloads. */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
    saveBlob({
        filename: filename || FALLBACK_FILENAME,
        blob: new Blob([bytes.slice().buffer], { type: "application/octet-stream" }),
    });
}
