import type { ModelFormat, ModelTexture } from "../types";
import { FORMAT_EXTENSIONS } from "./constants";

/**
 * What every writer stamps into the file it produces.
 *
 * Not a message key. A generator string is provenance written into somebody
 * else's file and read by their tooling, so it stays in English and stays the
 * same in both locales — the same rule that keeps `UTF-8` and `RFC 4648` out of
 * the catalogue.
 */
export const MODEL_GENERATOR = "ToolForge Image to 3D Model Converter";

/** The name of the mesh inside a GLB, and of the object inside an OBJ. */
export const MODEL_OBJECT_NAME = "relief";

export function modelFilename(stem: string, format: ModelFormat): string {
    return `${stem}.${FORMAT_EXTENSIONS[format]}`;
}

/**
 * The three names inside an OBJ archive.
 *
 * Fixed rather than derived from the reader's filename, and `mtllib` and
 * `map_Kd` name them by exactly these strings. A stem carrying a space or a
 * Bangla vowel sign is legal in a ZIP and legal on disk, but `mtllib` has no
 * quoting rule at all — a space in that line splits it into two filenames, and
 * the material is silently dropped by the importer.
 */
export function objEntryNames(texture: ModelTexture | null) {
    return {
        obj: "model.obj",
        mtl: "model.mtl",
        texture: texture?.mimeType === "image/jpeg" ? "texture.jpg" : "texture.png",
    };
}
