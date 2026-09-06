import type { Heightfield, MeshOptions, MeshStats, ModelRefusal } from "../types";
import { buildHeightfield, gridSizeFor, type SourcePixels } from "./heightfield";
import { buildMesh } from "./mesh";
import { estimateMesh } from "./stats";
import type { Mesh } from "../types";

export type ModelResult =
    | {
          readonly ok: true;
          readonly mesh: Mesh;
          readonly stats: MeshStats;
          readonly field: Heightfield;
      }
    | { readonly ok: false; readonly reason: ModelRefusal; readonly triangles?: number };

/**
 * Picture to mesh, in one call.
 *
 * The single entry point the page and the island both use, so the preview, the
 * counts beside the controls and the downloaded bytes are all the same run of
 * the same code rather than three that agree most of the time.
 *
 * The aspect ratio comes from the picture rather than from the sample grid it
 * was reduced to. A 1000×667 photograph at 192 samples lands on a 192×128
 * grid, and a plate measured from that grid would come out 0.5 mm taller than
 * the picture it is of.
 */
export function buildModel(pixels: SourcePixels, options: MeshOptions): ModelResult {
    if (pixels.width <= 0 || pixels.height <= 0) {
        return { ok: false, reason: "empty_image" };
    }

    const field = buildHeightfield(pixels, options);
    const result = buildMesh(field, options, pixels.height / pixels.width);

    if (!result.ok) {
        return result;
    }

    return { ok: true, mesh: result.mesh, stats: result.stats, field };
}

/**
 * What the mesh would come to, without decoding anything.
 *
 * The controls need this on every keystroke of the resolution stepper, long
 * before there is a reason to rebuild a mesh, and it is also what decides
 * whether the download button is offered at all.
 */
export function previewStats(
    size: { readonly width: number; readonly height: number },
    options: MeshOptions,
): MeshStats {
    const grid = gridSizeFor(size, options.resolution);

    return estimateMesh({ columns: grid.width, rows: grid.height }, options);
}
