/** How much of the reader's own filename survives into the download. */
const MAX_STEM_LENGTH = 48;

const FALLBACK_STEM = "image";

/**
 * The reader's filename, reduced to something every filesystem accepts. The stem
 * is kept rather than discarded: a folder of downloads where every file is called
 * `watermark-removed.png` is a folder nobody can use.
 */
export function toFilenameStem(originalName: string): string {
    const withoutExtension = originalName.replace(/\.[^./\\]+$/, "");

    const slug = withoutExtension
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_STEM_LENGTH)
        .replace(/-+$/, "");

    return slug.length > 0 ? slug : FALLBACK_STEM;
}

/** `photo-watermark-removed-20260730T101500Z.png` — sortable and self-describing. */
export function buildCleanImageFilename(originalName: string, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `${toFilenameStem(originalName)}-watermark-removed-${stamp}.png`;
}
