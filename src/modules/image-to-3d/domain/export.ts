import { buildZipArchive } from "@/modules/tools/domain/archive";
import type { ArchiveEntry, BlobDownload } from "@/modules/tools/types";

import type { Mesh, ModelFormat, ModelTexture } from "../types";
import { FORMAT_MIME_TYPES } from "./constants";
import { MODEL_GENERATOR, MODEL_OBJECT_NAME, modelFilename, objEntryNames } from "./filenames";
import { encodeGlb } from "./glb";
import { encodeMtl, encodeObj } from "./obj";
import { encodePly } from "./ply";
import { encodeStl } from "./stl";

export type ModelExportInput = {
    readonly mesh: Mesh;
    readonly format: ModelFormat;
    /**
     * `null` when the picture could not be re-encoded as PNG or JPEG, which is
     * the only two things glTF and this ZIP will carry. Every format still
     * produces a file; GLB and PLY fall back to per-vertex colour and OBJ ships
     * without a material.
     */
    readonly texture: ModelTexture | null;
    readonly stem: string;
    /** The reader's own clock, because a ZIP records local time with no offset. */
    readonly generatedAt: Date;
};

/**
 * The bytes for one format, as one file.
 *
 * OBJ is the reason this returns a blob rather than a string: it is three files
 * that only mean anything together, so it is zipped, and a reader who is handed
 * `model.obj` alone gets an untextured grey mesh and no way to tell why.
 */
export function buildModelBytes(input: ModelExportInput): Uint8Array {
    switch (input.format) {
        case "glb":
            return encodeGlb(input.mesh, input.texture, {
                generator: MODEL_GENERATOR,
                name: MODEL_OBJECT_NAME,
            });
        case "stl":
            return encodeStl(input.mesh, MODEL_GENERATOR);
        case "ply":
            return encodePly(input.mesh, MODEL_GENERATOR);
        case "obj":
            return buildZipArchive(objArchiveEntries(input), input.generatedAt);
    }
}

export function objArchiveEntries(input: ModelExportInput): readonly ArchiveEntry[] {
    const names = objEntryNames(input.texture);
    const encoder = new TextEncoder();

    const entries: ArchiveEntry[] = [
        {
            name: names.obj,
            bytes: encoder.encode(
                encodeObj(input.mesh, { mtlName: names.mtl, comment: MODEL_GENERATOR }),
            ),
        },
    ];

    if (input.texture !== null) {
        entries.push(
            { name: names.mtl, bytes: encoder.encode(encodeMtl({ textureName: names.texture })) },
            { name: names.texture, bytes: input.texture.bytes },
        );
    }

    return entries;
}

export function buildModelDownload(input: ModelExportInput): BlobDownload {
    const bytes = buildModelBytes(input);

    return {
        filename: modelFilename(input.stem, input.format),
        // Copied into a fresh buffer so the blob owns bytes nothing else can
        // still be writing into.
        blob: new Blob([bytes.slice()], { type: FORMAT_MIME_TYPES[input.format] }),
    };
}
