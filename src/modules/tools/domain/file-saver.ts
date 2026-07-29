import type { BlobDownload, DownloadFile } from "../types";

/**
 * The three browser calls needed to hand a generated file to the user.
 * Injectable so the flow can be exercised without a DOM.
 */
export type FileSaver = {
    createObjectUrl(file: DownloadFile): string;
    openDownload(url: string, filename: string): void;
    revokeObjectUrl(url: string): void;
};

export const browserFileSaver: FileSaver = {
    createObjectUrl(file) {
        return URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    },
    openDownload(url, filename) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    },
    revokeObjectUrl(url) {
        URL.revokeObjectURL(url);
    },
};

export function saveFile(file: DownloadFile, saver: FileSaver = browserFileSaver): void {
    const url = saver.createObjectUrl(file);

    try {
        saver.openDownload(url, file.filename);
    } finally {
        saver.revokeObjectUrl(url);
    }
}

/**
 * The same three calls for a file that was never text. Kept separate from
 * `FileSaver` rather than widening `DownloadFile.content`: a caller holding
 * bytes has no encoding to declare, and a caller holding a string should not be
 * able to forget one.
 */
export type BlobSaver = {
    createObjectUrl(blob: Blob): string;
    openDownload(url: string, filename: string): void;
    revokeObjectUrl(url: string): void;
};

export const browserBlobSaver: BlobSaver = {
    createObjectUrl(blob) {
        return URL.createObjectURL(blob);
    },
    openDownload: browserFileSaver.openDownload,
    revokeObjectUrl: browserFileSaver.revokeObjectUrl,
};

export function saveBlob(download: BlobDownload, saver: BlobSaver = browserBlobSaver): void {
    const url = saver.createObjectUrl(download.blob);

    try {
        saver.openDownload(url, download.filename);
    } finally {
        saver.revokeObjectUrl(url);
    }
}
