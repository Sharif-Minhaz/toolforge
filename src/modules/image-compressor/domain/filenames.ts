import type { EncodedFormat } from "../types";

export const FORMAT_EXTENSIONS: Record<EncodedFormat, string> = {
    jpeg: "jpg",
    png: "png",
    webp: "webp",
    avif: "avif",
};

export const FORMAT_MIME_TYPES: Record<EncodedFormat, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
};

/** How much of the reader's own filename survives into the download. */
const MAX_STEM_LENGTH = 64;

const FALLBACK_STEM = "image";

/** Path separators plus the set Windows refuses inside a filename. */
const RESERVED_CHARACTERS = new Set(["/", "\\", "<", ">", ":", '"', "|", "?", "*"]);

/**
 * Tested one code point at a time rather than with a character class, so the
 * control range can be excluded by its code instead of by writing control
 * escapes into a regular expression.
 */
function isUnsafeCharacter(character: string): boolean {
    const code = character.codePointAt(0) ?? 0;

    return (
        code < 0x20 || code === 0x7f || RESERVED_CHARACTERS.has(character) || /\s/.test(character)
    );
}

/**
 * The reader's filename with its extension dropped and only the genuinely
 * dangerous characters removed.
 *
 * Unicode is kept rather than slugged to ASCII: a person who named a file in
 * Bangla should get that file back, and the archive writer marks its entry
 * names as UTF-8 so an unzipper reads them correctly. What does go is anything
 * that would change where the file lands or that no common filesystem accepts
 * — path separators, whitespace, control characters, and the Windows reserved
 * set. Leading dots go too, so a pick cannot produce a hidden file.
 */
export function toFilenameStem(originalName: string): string {
    const withoutExtension = originalName.replace(/\.[^./\\]+$/, "");

    const cleaned = [...withoutExtension]
        .map((character) => (isUnsafeCharacter(character) ? "-" : character))
        .join("")
        .replace(/-{2,}/g, "-")
        .slice(0, MAX_STEM_LENGTH)
        .replace(/^[.-]+/, "")
        .replace(/[.-]+$/, "");

    return cleaned.length > 0 ? cleaned : FALLBACK_STEM;
}

/** `holiday-min.webp` — the reader's name, plus what happened to it. */
export function buildOutputFilename(originalName: string, format: EncodedFormat): string {
    return `${toFilenameStem(originalName)}-min.${FORMAT_EXTENSIONS[format]}`;
}

/**
 * Makes a list of filenames unique, preserving order.
 *
 * Two files called `screenshot.png` in different folders are one drag away from
 * each other, and a ZIP holding the same entry name twice is read differently
 * by every unzipper — some keep the first, some the last, some refuse. The
 * disambiguator goes before the extension (`screenshot-min-2.webp`) so the
 * suffix a reader sorts by still works. Matching is case-insensitive, because
 * the filesystems this lands on mostly are.
 */
export function uniqueFilenames(names: readonly string[]): string[] {
    const taken = new Set<string>();

    return names.map((name) => {
        const match = /^(.*?)(\.[^.]*)?$/.exec(name);
        const stem = match?.[1] ?? name;
        const extension = match?.[2] ?? "";

        let candidate = name;
        let counter = 1;

        while (taken.has(candidate.toLowerCase())) {
            counter += 1;
            candidate = `${stem}-${counter}${extension}`;
        }

        taken.add(candidate.toLowerCase());

        return candidate;
    });
}

/** `toolforge-images-20260803T101500Z.zip` — sortable and self-describing. */
export function buildArchiveFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `toolforge-images-${stamp}.zip`;
}
