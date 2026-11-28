import type { MeshGroup, ModelFormat } from "../types";
import { FORMAT_EXTENSIONS } from "./constants";

/**
 * What every writer stamps into the file it produces.
 *
 * Not a message key. A generator string is provenance written into somebody
 * else's file and read by their tooling, so it stays in English and stays the
 * same in both locales — the same rule that keeps `UTF-8` and `RFC 4648` out of
 * the catalogue.
 */
export const MODEL_GENERATOR = "ToolForge Image to 3D Model";

export function modelFilename(stem: string, format: ModelFormat): string {
    return `${stem}.${FORMAT_EXTENSIONS[format]}`;
}

/**
 * The two names inside an OBJ archive.
 *
 * Fixed rather than derived from the reader's filename, because `mtllib` names
 * the library by exactly this string and has no quoting rule: a stem carrying a
 * space or a Bangla vowel sign is legal in a ZIP and on disk, and splits that
 * line into two filenames, and the colours are silently dropped by the
 * importer.
 */
export const OBJ_ENTRY_NAMES = { obj: "model.obj", mtl: "model.mtl" } as const;

/**
 * A part's own label in a file: its name, plus what the assembler made of it.
 * English, like the model's names; the page shows its own localised label.
 */
export function filePartLabel(group: MeshGroup): string {
    return [group.name, group.interior ? "inside" : null, group.mirrored ? "mirrored" : null]
        .filter((word) => word !== null)
        .join(" ");
}

/**
 * Every part's name as written into a file, unique across the model.
 *
 * Unique on purpose: two glTF nodes both called "foot" are renamed by every
 * reader that meets them — three to `foot_1`, Blender to `foot.001` — and the
 * reference test caught exactly that. Any label still repeated after
 * `filePartLabel` is numbered from its second use.
 */
export function filePartNames(groups: readonly MeshGroup[]): string[] {
    const seen = new Map<string, number>();

    return groups.map((group) => {
        const base = filePartLabel(group);
        const uses = (seen.get(base) ?? 0) + 1;

        seen.set(base, uses);

        return uses === 1 ? base : `${base} ${uses}`;
    });
}
