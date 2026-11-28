import { buildZipArchive } from "@/modules/tools/domain/archive";
import type { ArchiveEntry, BlobDownload } from "@/modules/tools/types";

import type { Mesh, ModelFormat } from "../types";
import { FORMAT_MIME_TYPES } from "./constants";
import { MODEL_GENERATOR, modelFilename, OBJ_ENTRY_NAMES } from "./filenames";
import { encodeGlb } from "./glb";
import { encodeMtl, encodeObj } from "./obj";
import { encodePly } from "./ply";
import { encodeStl } from "./stl";

export type ModelExportInput = {
    readonly mesh: Mesh;
    readonly format: ModelFormat;
    /** The object's name as the model gave it — the GLB's root node. */
    readonly name: string;
    readonly stem: string;
    /** The reader's own clock, because a ZIP records local time with no offset. */
    readonly generatedAt: Date;
};

/**
 * The bytes for one format, as one file.
 *
 * OBJ is the reason this returns bytes rather than a string: its colours live
 * in a second file that only means anything beside the first, so the two are
 * zipped, and a reader handed `model.obj` alone gets a grey model and no way
 * to tell why.
 */
export function buildModelBytes(input: ModelExportInput): Uint8Array {
    switch (input.format) {
        case "glb":
            return encodeGlb(input.mesh, { generator: MODEL_GENERATOR, name: input.name });
        case "stl":
            return encodeStl(input.mesh, MODEL_GENERATOR);
        case "ply":
            return encodePly(input.mesh, MODEL_GENERATOR);
        case "obj":
            return buildZipArchive(objArchiveEntries(input.mesh), input.generatedAt);
    }
}

export function objArchiveEntries(mesh: Mesh): readonly ArchiveEntry[] {
    const encoder = new TextEncoder();

    return [
        {
            name: OBJ_ENTRY_NAMES.obj,
            bytes: encoder.encode(
                encodeObj(mesh, { mtlName: OBJ_ENTRY_NAMES.mtl, comment: MODEL_GENERATOR }),
            ),
        },
        { name: OBJ_ENTRY_NAMES.mtl, bytes: encoder.encode(encodeMtl(mesh)) },
    ];
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
